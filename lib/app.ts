import { IConnectable } from "aws-cdk-lib/aws-ec2";
import { App, Stack } from "aws-cdk-lib";
import { ClusterConstruct } from "./cluster";
import { MeshConstruct } from "./mesh";
import {
  GatewayRouteSpec,
  HttpGatewayRoutePathMatch,
  RouteSpec,
  VirtualRouter,
  VirtualRouterListener,
  VirtualService,
  VirtualServiceProvider,
} from "aws-cdk-lib/aws-appmesh";
import { ExpressJsAppMesh } from "./express-app-mesh";

interface Props {
  namespaceName: string;
  externalAccess: IConnectable;
}

export class MeshTestApp extends App {
  constructor(props: Props) {
    super();

    const { namespaceName, externalAccess } = props;

    const stack = new Stack(this, namespaceName);

    const clusterStack = new ClusterConstruct(stack, "Cluster", {
      namespaceName,
    });

    const { cluster, httpNamespaceName, namespace } = clusterStack;

    const meshStack = new MeshConstruct(stack, "Mesh", {
      cluster,
      namespace,
      externalAccess,
    });

    const { mesh, gateway, securityGroup } = meshStack;

    const meshThings = {
      cluster,
      namespace,
      httpNamespaceName,
      mesh,
      gateway,
      securityGroup,
    };

    const expressJsBlue = new ExpressJsAppMesh(stack, "Blue", {
      serviceName: "blue",
      ...meshThings,
    });

    const expressJsGreen = new ExpressJsAppMesh(stack, "Green", {
      serviceName: "green",
      backends: [expressJsBlue.virtualService],
      ...meshThings,
    });

    const blueGreenRouter = new VirtualRouter(stack, "Router", {
      mesh,
      virtualRouterName: "router",
      listeners: [VirtualRouterListener.http(80)],
    });
    blueGreenRouter.addRoute("blue-green", {
      routeName: "blue-green",
      routeSpec: RouteSpec.http({
        weightedTargets: [
          {
            virtualNode: expressJsBlue.virtualNode,
            weight: 50,
          },
          {
            virtualNode: expressJsGreen.virtualNode,
            weight: 50,
          },
        ],
      }),
    });

    const blueGreenService = new VirtualService(stack, "RouterService", {
      virtualServiceProvider:
        VirtualServiceProvider.virtualRouter(blueGreenRouter),
      virtualServiceName: "router-service",
    });

    const gatewayRoutes = {
      blue: expressJsBlue.virtualService,
      green: expressJsGreen.virtualService,
      "blue-green": blueGreenService,
    };

    for (const [route, service] of Object.entries(gatewayRoutes)) {
      gateway.addGatewayRoute(route, {
        routeSpec: GatewayRouteSpec.http({
          routeTarget: service,
          match: {
            path: HttpGatewayRoutePathMatch.startsWith(`/service-${route}`),
          },
        }),
      });
    }
  }
}
