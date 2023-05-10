import { App, Stack } from "aws-cdk-lib";
import {
  GatewayRouteSpec,
  HttpGatewayRoutePathMatch,
  RouteSpec,
  VirtualRouter,
  VirtualRouterListener,
  VirtualService,
  VirtualServiceProvider,
} from "aws-cdk-lib/aws-appmesh";
import { IConnectable } from "aws-cdk-lib/aws-ec2";
import { Construct } from "constructs";
import { BlueGreenDeployment } from "./blue-green";
import { ClusterStack } from "./cluster";
import { ExpressJsAppMeshService } from "./express-app-mesh";
import { MeshStack } from "./mesh";

interface Props {
  namespaceName: string;
  externalAccess: IConnectable;
}

export class BlueGreenApp extends Construct {
  constructor(scope: App, id: string, props: Props) {
    super(scope, id);

    const { namespaceName, externalAccess } = props;

    const stack = new Stack(this, "blue-green");

    const clusterStack = new ClusterStack(stack, "Cluster", {
      namespaceName,
    });

    const { cluster, httpNamespaceName, namespace } = clusterStack;

    const meshStack = new MeshStack(stack, "Mesh", {
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

    const deploy = new BlueGreenDeployment(stack, "Deploy", {
      version: 5,
      build: (scope, version) => {
        const service = new ExpressJsAppMeshService(scope, "Service", {
          serviceName: scope.node.id,
          version: version.toString(),
          ...meshThings,
        });
        return service.virtualNode;
      },
    });

    // construct router on top of services

    const router = new VirtualRouter(stack, "Router", {
      mesh,
      virtualRouterName: "router",
      listeners: [VirtualRouterListener.http(80)],
    });
    router.addRoute("blue-green", {
      routeName: "blue-green",
      routeSpec: RouteSpec.http({
        weightedTargets: [
          {
            virtualNode: deploy.blue,
            weight: 50,
          },
          {
            virtualNode: deploy.green,
            weight: 50,
          },
        ],
      }),
    });

    const blueGreenSerice = new VirtualService(stack, "RouterService", {
      virtualServiceProvider: VirtualServiceProvider.virtualRouter(router),
      virtualServiceName: "router-service",
    });

    gateway.addGatewayRoute("blue-green", {
      routeSpec: GatewayRouteSpec.http({
        routeTarget: blueGreenSerice,
        match: {
          path: HttpGatewayRoutePathMatch.startsWith(`/service-blue-green`),
        },
      }),
    });
  }
}
