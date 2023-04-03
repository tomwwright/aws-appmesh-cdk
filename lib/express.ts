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
  serviceName: string;
  cluster: Cluster;
  namespace: IHttpNamespace;
  mesh: Mesh;
  gateway: VirtualGateway;
  securityGroup: ISecurityGroup;
}

export class ExpressJsStack extends Construct {
  public readonly virtualService: VirtualService;
  public readonly virtualNode: VirtualNode;
  constructor(scope: Construct, id: string, props: Props) {
    super(scope, id);

    const { cluster, namespace, mesh, gateway } = props;

    const taskDefinition = new FargateTaskDefinition(this, "TaskDefinition");
    taskDefinition.addContainer("expressjs", {
      image: ContainerImage.fromAsset("expressjs"),
      command: ["serve:js"],
      logging: LogDriver.awsLogs({ streamPrefix: "expressjs" }),
      environment: {
        SERVICE_NAME: props.serviceName,
        SERVICE_PORT: "80",
      },
      portMappings: [
        {
          name: "expressjs",
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
            portMappingName: "expressjs",
            discoveryName: props.serviceName,
          },
        ],
        logDriver: LogDriver.awsLogs({
          streamPrefix: "proxy",
        }),
      },
      securityGroups: [props.securityGroup],
    });

    const cloudMapService = Service.fromServiceAttributes(
      this,
      "CloudMapService",
      {
        namespace: props.namespace,
        serviceName: props.serviceName,
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
    this.virtualNode = virtualNode;

    const virtualService = new VirtualService(this, "VirtualService", {
      virtualServiceName: props.serviceName,
      virtualServiceProvider: VirtualServiceProvider.virtualNode(virtualNode),
    });
    this.virtualService = virtualService;

    gateway.addGatewayRoute(props.serviceName, {
      routeSpec: GatewayRouteSpec.http({
        routeTarget: virtualService,
        match: {
          path: HttpGatewayRoutePathMatch.startsWith(
            `/service-${props.serviceName}`
          ),
        },
      }),
    });
  }
}
