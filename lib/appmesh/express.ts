import { Duration } from "aws-cdk-lib";
import {
  AccessLog,
  HealthCheck,
  Mesh,
  ServiceDiscovery,
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
  DnsRecordType,
  INamespace,
  Service,
} from "aws-cdk-lib/aws-servicediscovery";
import { Construct } from "constructs";

interface Props {
  serviceName: string;
  version?: string;
  cluster: Cluster;
  namespace: INamespace;
  mesh: Mesh;
  securityGroup: ISecurityGroup;
}

export class AppMeshExpress extends Construct {
  public readonly virtualService: VirtualService;
  public readonly virtualNode: VirtualNode;
  constructor(scope: Construct, id: string, props: Props) {
    super(scope, id);

    const { cluster, mesh } = props;

    const taskDefinition = new FargateTaskDefinition(this, "TaskDefinition", {
      proxyConfiguration: new AppMeshProxyConfiguration({
        containerName: "proxy",
        properties: {
          appPorts: [80],
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
        command: ["CMD-SHELL", "curl -f http://localhost:80 || exit 1"],
        interval: Duration.seconds(5),
        startPeriod: Duration.seconds(10),
        timeout: Duration.seconds(2),
        retries: 2,
      },
      environment: {
        SERVICE_NAME: props.serviceName,
        SERVICE_PORT: "80",
        SERVICE_VERSION: props.version ?? "unknown",
      },
      portMappings: [
        {
          containerPort: 80,
        },
      ],
    });

    const service = new FargateService(this, "Service", {
      cluster,
      taskDefinition,
      securityGroups: [props.securityGroup],
      assignPublicIp: true,
    });

    const cloudMapService = new Service(this, "ServiceDiscovery", {
      name: props.serviceName,
      namespace: props.namespace,
      dnsRecordType: DnsRecordType.A,
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
          port: 80,
          healthCheck: HealthCheck.http(),
        }),
      ],
      accessLog: AccessLog.fromFilePath("/dev/stdout"),
    });
    virtualNode.grantStreamAggregatedResources(taskDefinition.taskRole);
    this.virtualNode = virtualNode;

    const proxyContainer = taskDefinition.addContainer("proxy", {
      image: ContainerImage.fromRegistry(
        "public.ecr.aws/appmesh/aws-appmesh-envoy:v1.24.0.0-prod"
      ),
      environment: {
        APPMESH_RESOURCE_ARN: virtualNode.virtualNodeArn,
        ENABLE_ENVOY_STATS_TAGS: "1",
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
        {
          containerPort: 15000,
        },
        {
          containerPort: 15001,
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
      virtualServiceName: `${props.serviceName}.${props.namespace.namespaceName}`,
      virtualServiceProvider: VirtualServiceProvider.virtualNode(virtualNode),
    });
    this.virtualService = virtualService;
  }
}
