import {
  AccessLog,
  GatewayRouteSpec,
  HealthCheck,
  HttpGatewayRoutePathMatch,
  Mesh,
  ServiceDiscovery,
  VirtualGateway,
  VirtualNode,
  VirtualNodeListener,
  VirtualService,
  VirtualServiceProvider,
} from "aws-cdk-lib/aws-appmesh";
import { IConnectable, ISecurityGroup, Port } from "aws-cdk-lib/aws-ec2";
import {
  AppProtocol,
  Cluster,
  ContainerImage,
  FargateService,
  FargateTaskDefinition,
  LogDriver,
  Protocol,
} from "aws-cdk-lib/aws-ecs";
import {
  Service,
  DiscoveryType,
  DnsRecordType,
  RoutingPolicy,
  IHttpNamespace,
} from "aws-cdk-lib/aws-servicediscovery";
import { Construct } from "constructs";

interface Props {
  cluster: Cluster;
  namespace: IHttpNamespace;
  mesh: Mesh;
  gateway: VirtualGateway;
  securityGroup: ISecurityGroup;
}

export class NginxStack extends Construct {
  constructor(scope: Construct, id: string, props: Props) {
    super(scope, id);

    const { cluster, namespace, mesh, gateway, securityGroup } = props;

    const taskDefinition = new FargateTaskDefinition(this, "TaskDefinition");
    taskDefinition.addContainer("nginx", {
      image: ContainerImage.fromRegistry(
        "public.ecr.aws/docker/library/nginx:latest"
      ),
      logging: LogDriver.awsLogs({ streamPrefix: "nginx" }),
      portMappings: [
        {
          name: "nginx",
          containerPort: 80,
          protocol: Protocol.TCP,
          appProtocol: AppProtocol.http,
        },
      ],
    });

    const service = new FargateService(this, "Service", {
      cluster,
      taskDefinition,
      serviceConnectConfiguration: {
        namespace: namespace.namespaceName,
        services: [
          {
            portMappingName: "nginx",
          },
        ],
        logDriver: LogDriver.awsLogs({
          streamPrefix: "nginx-proxy",
        }),
      },
      securityGroups: [securityGroup],
    });

    const cloudMapService = Service.fromServiceAttributes(
      this,
      "CloudMapService",
      {
        namespace: props.namespace,
        serviceName: "nginx",
        discoveryType: DiscoveryType.API,
        serviceId: "xxxx",
        serviceArn: "xxxx",
        dnsRecordType: DnsRecordType.SRV,
        routingPolicy: RoutingPolicy.WEIGHTED,
      }
    );

    const virtualNode = new VirtualNode(this, "VirtualNode", {
      mesh,
      serviceDiscovery: ServiceDiscovery.cloudMap(cloudMapService),
      listeners: [
        VirtualNodeListener.http({
          port: 80,
          healthCheck: HealthCheck.http(),
        }),
      ],
      accessLog: AccessLog.fromFilePath("/dev/stdout"),
    });

    const virtualService = new VirtualService(this, "VirtualService", {
      virtualServiceName: "nginx",
      virtualServiceProvider: VirtualServiceProvider.virtualNode(virtualNode),
    });

    gateway.addGatewayRoute("nginx", {
      routeSpec: GatewayRouteSpec.http({
        routeTarget: virtualService,
        match: {
          path: HttpGatewayRoutePathMatch.startsWith("/service-nginx"),
        },
      }),
    });
  }
}
