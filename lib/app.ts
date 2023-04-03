import { IConnectable } from "aws-cdk-lib/aws-ec2";
import { App, Stack } from "aws-cdk-lib";
import { ClusterStack } from "./cluster";
import { MeshStack } from "./mesh";
import { NginxStack } from "./nginx";
import { ExpressJsStack } from "./express";
import {
  GatewayRouteSpec,
  HttpGatewayRoutePathMatch,
  RouteSpec,
  VirtualRouter,
  VirtualRouterListener,
  VirtualService,
  VirtualServiceProvider,
} from "aws-cdk-lib/aws-appmesh";
import { ExpressJsAppMeshStack } from "./express-app-mesh";
import {
  AwsCustomResource,
  AwsCustomResourcePolicy,
  PhysicalResourceId,
  PhysicalResourceIdReference,
} from "aws-cdk-lib/custom-resources";

interface Props {
  namespaceName: string;
  externalAccess: IConnectable;
}

export class MeshTestApp extends App {
  constructor(props: Props) {
    super();

    const { namespaceName, externalAccess } = props;

    const stack = new Stack(this, namespaceName);

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

    const expressJsBlue = new ExpressJsAppMeshStack(stack, "Blue", {
      serviceName: "blue",
      ...meshThings,
    });

    const expressJsGreen = new ExpressJsAppMeshStack(stack, "Green", {
      serviceName: "green",
      backends: [expressJsBlue.virtualService],
      ...meshThings,
    });

    // const nginx = new NginxStack(stack, "Nginx", {
    //   ...meshThings,
    // });

    // const expressJsBlue = new ExpressJsStack(stack, "Blue", {
    //   serviceName: "blue",
    //   ...meshThings,
    // });

    // const expressJsGreen = new ExpressJsStack(stack, "Green", {
    //   serviceName: "green",
    //   ...meshThings,
    // });

    // const router = new VirtualRouter(stack, "Router", {
    //   mesh,
    //   virtualRouterName: "router",
    //   listeners: [VirtualRouterListener.http(80)],
    // });
    // router.addRoute("blue-green", {
    //   routeName: "blue-green",
    //   routeSpec: RouteSpec.http({
    //     weightedTargets: [
    //       {
    //         virtualNode: expressJsBlue.virtualNode,
    //         weight: 50,
    //       },
    //       {
    //         virtualNode: expressJsGreen.virtualNode,
    //         weight: 50,
    //       },
    //     ],
    //   }),
    // });

    // const routerService = new VirtualService(stack, "RouterService", {
    //   virtualServiceProvider: VirtualServiceProvider.virtualRouter(router),
    //   virtualServiceName: "router-service",
    // });

    // gateway.addGatewayRoute("blue-green", {
    //   routeSpec: GatewayRouteSpec.http({
    //     routeTarget: routerService,
    //     match: {
    //       path: HttpGatewayRoutePathMatch.startsWith(`/service-blue-green`),
    //     },
    //   }),
    // });
  }
}
