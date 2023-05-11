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

    // create ourselves an empty stack to hold our resources

    const stack = new Stack(this, namespaceName);

    /**
     * create our ECS Cluster that is configured for App Mesh
     *
     * the key difference is that the namespace is backed by Route 53
     *
     * `cluster` our ECS Cluster with underlying default VPC
     * `namespace` our Cloud Map namespace created by ourselves
     * `securityGroup` security group accessible from our IP to make things easy
     **/

    const { cluster, namespace, securityGroup } = new AppMeshCluster(
      stack,
      "Cluster",
      {
        namespaceName,
        externalAccess,
      }
    );

    /**
     * configure App Mesh components
     *
     * `mesh` the App Mesh mesh that services will be added to as nodes,
     * routes, services, etc.
     * `gateway` the App Mesh Gateway, running on ECS Fargate, that will
     * receive external traffic and route it into the service mesh
     */

    const { mesh, gateway } = new AppMesh(stack, "Mesh", {
      cluster,
      securityGroup,
    });

    const meshThings = {
      cluster,
      namespace,
      mesh,
      gateway,
      securityGroup,
    };

    /**
     * create two ECS Services, "blue" and "green", running our sample Express.js
     * application that are configured for App Mesh
     *
     * the details of configuring for App Mesh are quite gory -- take a look
     * inside the Construct!
     *
     * thankfull this is precisely the sort of thing that AWS CDK excels at,
     * abstracting away gory details
     *
     * we can use the /downstream endpoint of our sample application to explore
     * how these services are able to discover and route traffic to each other
     * as they have been connected to the same namespace
     **/

    const blue = new AppMeshExpress(stack, "Blue", {
      serviceName: "blue",
      ...meshThings,
    });

    const green = new AppMeshExpress(stack, "Green", {
      serviceName: "green",
      ...meshThings,
    });

    /**
     * configure each service as a "backend" of the other's node so that
     * traffic can be routed between them via the mesh
     */

    blue.virtualNode.addBackend(Backend.virtualService(green.virtualService));
    green.virtualNode.addBackend(Backend.virtualService(blue.virtualService));

    /**
     * configure a route on the gateway for each service so that
     * traffic entering the mesh is routed to that service
     *
     * this sets up path-based routing:
     * - all traffic with path starting with '/blue' -> blue
     * - all traffic with path starting with '/green' -> green
     */

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

    /**
     * configure a router that divides traffic equally between our
     * "blue" and "green" nodes
     */

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

    /**
     * wrap our router in a service so that it can be the destination of
     * a gateway route:
     * - all traffic with path starting with '/split' -> router
     */

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
