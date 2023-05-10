import { IConnectable } from "aws-cdk-lib/aws-ec2";
import { App, Stack } from "aws-cdk-lib";
import {
  Backend,
  GatewayRouteSpec,
  HttpGatewayRoutePathMatch,
  RouteSpec,
  VirtualRouter,
  VirtualRouterListener,
  VirtualService,
  VirtualServiceProvider,
} from "aws-cdk-lib/aws-appmesh";
import { AppMesh } from "./appmesh/mesh";
import { AppMeshCluster } from "./appmesh/cluster";
import { AppMeshExpress } from "./appmesh/express";

interface Props {
  namespaceName: string;
  externalAccess: IConnectable;
}

export class AppMeshApp extends App {
  constructor(props: Props) {
    super();

    const { namespaceName, externalAccess } = props;

    const stack = new Stack(this, namespaceName);

    const clusterStack = new AppMeshCluster(stack, "Cluster", {
      namespaceName,
      externalAccess,
    });

    const { cluster, namespace, securityGroup } = clusterStack;

    const meshStack = new AppMesh(stack, "Mesh", {
      cluster,
      namespace,
      securityGroup,
    });

    const { mesh, gateway } = meshStack;

    const meshThings = {
      cluster,
      namespace,
      mesh,
      gateway,
      securityGroup,
    };

    const blue = new AppMeshExpress(stack, "Blue", {
      serviceName: "blue",
      ...meshThings,
    });

    const green = new AppMeshExpress(stack, "Green", {
      serviceName: "green",
      ...meshThings,
    });

    blue.virtualNode.addBackend(Backend.virtualService(green.virtualService));
    green.virtualNode.addBackend(Backend.virtualService(blue.virtualService));

    // configure gateway routes for the services

    gateway.addGatewayRoute("blue", {
      routeSpec: GatewayRouteSpec.http({
        routeTarget: blue.virtualService,
        match: {
          path: HttpGatewayRoutePathMatch.startsWith("/blue"),
        },
      }),
    });

    gateway.addGatewayRoute("green", {
      routeSpec: GatewayRouteSpec.http({
        routeTarget: green.virtualService,
        match: {
          path: HttpGatewayRoutePathMatch.startsWith("/green"),
        },
      }),
    });

    // configure fancy routing based on path

    const router = new VirtualRouter(stack, "Router", {
      mesh,
      virtualRouterName: "router",
      listeners: [VirtualRouterListener.http(80)],
    });

    router.addRoute("split", {
      routeName: "split",
      routeSpec: RouteSpec.http({
        weightedTargets: [
          {
            virtualNode: blue.virtualNode,
            weight: 50,
          },
          {
            virtualNode: green.virtualNode,
            weight: 50,
          },
        ],
      }),
    });

    const routerService = new VirtualService(stack, "RouterService", {
      virtualServiceProvider: VirtualServiceProvider.virtualRouter(router),
      virtualServiceName: "router",
    });

    gateway.addGatewayRoute("split", {
      routeSpec: GatewayRouteSpec.http({
        routeTarget: routerService,
        match: {
          path: HttpGatewayRoutePathMatch.startsWith("/split"),
        },
      }),
    });
  }
}
