import { Duration } from "aws-cdk-lib";
import {
  AccessLog,
  Backend,
  CfnVirtualNode,
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
import { ISecurityGroup } from "aws-cdk-lib/aws-ec2";
import {
  AppMeshProxyConfiguration,
  Cluster,
  ContainerImage,
  FargateService,
  FargateTaskDefinition,
  LogDriver,
  UlimitName,
} from "aws-cdk-lib/aws-ecs";
import {
  DiscoveryType,
  DnsRecordType,
  Service,
} from "aws-cdk-lib/aws-servicediscovery";
import { Construct } from "constructs";

interface Props {
  serviceName: string;
  version?: string;
  cluster: Cluster;
  httpNamespaceName: string;
  mesh: Mesh;
  securityGroup: ISecurityGroup;
  backends?: VirtualService[];
}

export class ExpressJsAppMeshService extends Construct {
  public readonly virtualService: VirtualService;
  public readonly virtualNode: VirtualNode;
  constructor(scope: Construct, id: string, props: Props) {
    super(scope, id);

    const { cluster, httpNamespaceName, mesh } = props;

    const taskDefinition = new FargateTaskDefinition(this, "TaskDefinition", {
      proxyConfiguration: new AppMeshProxyConfiguration({
        containerName: "proxy",
        properties: {
          appPorts: [9080],
          ignoredUID: 1337,
          proxyIngressPort: 15000,
          proxyEgressPort: 15001,
          egressIgnoredIPs: ["169.254.170.2", "169.254.169.254"],
        },
      }),
    });

    const expressContainer = taskDefinition.addContainer("expressjs", {
      image: ContainerImage.fromAsset("expressjs"),
      command: ["serve:js"],
      logging: LogDriver.awsLogs({ streamPrefix: "expressjs" }),
      healthCheck: {
        command: ["CMD-SHELL", "curl -f http://localhost:9080 || exit 1"],
        interval: Duration.seconds(5),
        timeout: Duration.seconds(2),
        retries: 2,
      },
      environment: {
        SERVICE_NAME: props.serviceName,
        SERVICE_PORT: "9080",
        SERVICE_VERSION: props.version ?? "unknown",
      },
      portMappings: [
        {
          containerPort: 9080,
        },
      ],
    });

    const service = new FargateService(this, "Service", {
      cluster,
      taskDefinition,
      securityGroups: [props.securityGroup],
      assignPublicIp: false,
    });

    if (!cluster.defaultCloudMapNamespace) {
      throw new Error(
        "ECS Cluster not associated with AWS CloudMap namespace!"
      );
    }

    const cloudMapService = new Service(this, "ServiceDiscovery", {
      name: props.serviceName,
      namespace: cluster.defaultCloudMapNamespace,
      dnsRecordType: DnsRecordType.SRV,
      customHealthCheck: {
        failureThreshold: 1,
      },
    });

    service.associateCloudMapService({
      service: cloudMapService,
    });

    const virtualNode = new VirtualNode(this, "VirtualNode", {
      mesh,
      serviceDiscovery: ServiceDiscovery.cloudMap(cloudMapService),
      listeners: [
        VirtualNodeListener.http({
          port: 9080,
          healthCheck: HealthCheck.http(),
        }),
      ],
      backends: props.backends
        ? props.backends.map((backend) => Backend.virtualService(backend))
        : undefined,
      accessLog: AccessLog.fromFilePath("/dev/stdout"),
    });
    virtualNode.grantStreamAggregatedResources(taskDefinition.taskRole);
    this.virtualNode = virtualNode;

    // monkey-patch the Virtual Node to set the correct NamespaceName
    const cfnVirtualNode = virtualNode.node.defaultChild as CfnVirtualNode;
    cfnVirtualNode.addPropertyOverride(
      "Spec.ServiceDiscovery.AWSCloudMap.NamespaceName",
      httpNamespaceName
    );

    const proxyContainer = taskDefinition.addContainer("proxy", {
      image: ContainerImage.fromRegistry(
        "public.ecr.aws/appmesh/aws-appmesh-envoy:v1.24.0.0-prod"
      ),
      environment: {
        APPMESH_RESOURCE_ARN: virtualNode.virtualNodeArn,
        ENABLE_ENVOY_STATS_TAGS: "1",
        ENVOY_LOG_LEVEL: "trace",
      },
      healthCheck: {
        command: [
          "CMD-SHELL",
          "curl -s http://localhost:9901/server_info | grep state | grep -q LIVE",
        ],
        interval: Duration.seconds(5),
        timeout: Duration.seconds(2),
        retries: 3,
        startPeriod: Duration.seconds(10),
      },
      logging: LogDriver.awsLogs({
        streamPrefix: "proxy",
      }),
      user: "1337",
      portMappings: [
        {
          containerPort: 9901,
        },
      ],
    });
    proxyContainer.addUlimits({
      name: UlimitName.NOFILE,
      hardLimit: 15000,
      softLimit: 15000,
    });

    expressContainer.addContainerDependencies({
      container: proxyContainer,
    });

    const virtualService = new VirtualService(this, "VirtualService", {
      virtualServiceName: props.serviceName,
      virtualServiceProvider: VirtualServiceProvider.virtualNode(virtualNode),
    });
    this.virtualService = virtualService;
  }
}
