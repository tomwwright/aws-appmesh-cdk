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

    /**
     * our task definition needs to have proxy configuration applied
     *
     * this is almost entirely boilerplate except for 'appPort' which
     * indicates which port our running service will be on
     *
     * (app mesh needs to know this port so that it can 'hijack' it
     * for the proxying)
     */

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

    /**
     * configure and add our application -- note there is nothing
     * "service meshy" about it!
     *
     * unbeknownst to our little application, all sort of whacky
     * stuff is happening elsewhere...
     */

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

    /**
     * register our service for service discovery with Cloud Map
     */

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

    /**
     * create a logical node and service in our service mesh for our
     * Express.js application
     *
     * note how service discovery is "wired up" on the virtual node
     * to our Cloud Map service that we just registered
     *
     * ECS -> Cloud Map -> App Mesh
     */

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

    const virtualService = new VirtualService(this, "VirtualService", {
      virtualServiceName: `${props.serviceName}.${props.namespace.namespaceName}`,
      virtualServiceProvider: VirtualServiceProvider.virtualNode(virtualNode),
    });
    this.virtualService = virtualService;

    /**
     * where the magic happens -- configure an Envoy proxy sidecar in our task
     * definition
     *
     * note again the use of APPMESH_RESOURCE_ARN to configure this proxy
     * as the virtual node we added
     *
     * the rest is _entirely_ boilerplate :sweat:
     */

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
  }
}
