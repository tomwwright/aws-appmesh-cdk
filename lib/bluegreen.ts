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
import { BlueGreenDeployment } from "./bluegreen/deployment";
import { AppMeshCluster } from "./appmesh/cluster";
import { AppMeshExpress } from "./appmesh/express";
import { AppMesh } from "./appmesh/mesh";

interface Props {
  namespaceName: string;
  externalAccess: IConnectable;
}

export class BlueGreenApp extends Construct {
  constructor(scope: App, id: string, props: Props) {
    super(scope, id);

    const { namespaceName, externalAccess } = props;

    const stack = new Stack(this, namespaceName);

    const { cluster, namespace, securityGroup } = new AppMeshCluster(
      stack,
      "Cluster",
      {
        namespaceName,
        externalAccess,
      }
    );

    const { mesh, gateway } = new AppMesh(stack, "Mesh", {
      cluster,
      namespace,
      securityGroup,
    });

    const meshThings = {
      cluster,
      namespace,
      mesh,
      gateway,
      securityGroup,
    };

    const deployment = new BlueGreenDeployment(stack, "Deploy", {
      version: 1,
      build: (scope, version) => {
        const service = new AppMeshExpress(scope, "Service", {
          serviceName: scope.node.id.toLowerCase(),
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
    router.addRoute("bluegreen", {
      routeName: "bluegreen",
      routeSpec: RouteSpec.http({
        weightedTargets: [
          {
            virtualNode: deployment.blue,
            weight: 50,
          },
          {
            virtualNode: deployment.green,
            weight: 50,
          },
        ],
      }),
    });

    const routerService = new VirtualService(stack, "RouterService", {
      virtualServiceProvider: VirtualServiceProvider.virtualRouter(router),
      virtualServiceName: "router",
    });

    gateway.addGatewayRoute("bluegreen", {
      routeSpec: GatewayRouteSpec.http({
        routeTarget: routerService,
      }),
    });
  }
}
