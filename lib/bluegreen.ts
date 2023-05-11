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

    // create a stack to hold all our resources

    const stack = new Stack(this, namespaceName);

    /**
     * set up for a App Mesh as per last time
     */

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
     * construct a BlueGreenDeployment, passing the current version
     *
     * if this is already deployed this version will be partnered with
     * the previous version stored in Parameter Store state
     *
     * the `build` prop is passed a function used to construct both the
     * blue and green sides of the deployment, see BlueGreenDeployment
     * for details
     *
     * the `build` prop kind of works like "render props" pattern from React
     *
     * for this example, our blue-green deployment is simply one instance
     * of our Express.js app wired into App Mesh
     *
     */

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

    /**
     * construct a router on top of our two nodes exposed by the
     * BlueGreenDeployment and connect that to our gateway
     */

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
