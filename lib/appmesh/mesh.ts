import * as cdk from "aws-cdk-lib";
import { Duration, StackProps } from "aws-cdk-lib";
import {
  AccessLog,
  HealthCheck,
  Mesh,
  MeshFilterType,
  VirtualGateway,
  VirtualGatewayListener,
} from "aws-cdk-lib/aws-appmesh";
import { ISecurityGroup, Peer, Port } from "aws-cdk-lib/aws-ec2";
import {
  Cluster,
  ContainerImage,
  FargateTaskDefinition,
  LogDriver,
  Protocol,
} from "aws-cdk-lib/aws-ecs";
import { NetworkLoadBalancedFargateService } from "aws-cdk-lib/aws-ecs-patterns";
import { Effect, PolicyStatement } from "aws-cdk-lib/aws-iam";
import { Construct } from "constructs";

interface Props extends StackProps {
  cluster: Cluster;
  securityGroup: ISecurityGroup;
}

export class AppMesh extends Construct {
  public readonly mesh: Mesh;
  public readonly gateway: VirtualGateway;
  constructor(scope: Construct, id: string, props: Props) {
    super(scope, id);

    const { cluster, securityGroup } = props;

    const mesh = new Mesh(this, "Mesh", {
      egressFilter: MeshFilterType.DROP_ALL,
    });
    this.mesh = mesh;

    const gateway = new VirtualGateway(this, "VirtualGateway", {
      mesh,
      listeners: [
        VirtualGatewayListener.http({
          port: 9080,
          healthCheck: HealthCheck.http({
            interval: cdk.Duration.seconds(10),
          }),
        }),
      ],
      accessLog: AccessLog.fromFilePath("/dev/stdout"),
      virtualGatewayName: "virtual-gateway",
    });
    this.gateway = gateway;

    const gatewayTaskDefinition = new FargateTaskDefinition(
      this,
      "GatewayTaskDefinition"
    );
    gatewayTaskDefinition.addContainer("proxy", {
      image: ContainerImage.fromRegistry(
        "public.ecr.aws/appmesh/aws-appmesh-envoy:v1.24.0.0-prod"
      ),
      environment: {
        APPMESH_RESOURCE_ARN: gateway.virtualGatewayArn,
        ENABLE_ENVOY_STATS_TAGS: "1",
        ENVOY_LOG_LEVEL: "trace",
      },
      portMappings: [
        {
          containerPort: 9080,
          protocol: Protocol.TCP,
        },
        {
          containerPort: 9901,
          protocol: Protocol.TCP,
        },
      ],
      healthCheck: {
        command: [
          "CMD-SHELL",
          "curl -s http://localhost:9901/server_info | grep state | grep -q LIVE",
        ],
        interval: Duration.seconds(5),
        timeout: Duration.seconds(2),
        retries: 3,
        startPeriod: Duration.seconds(60),
      },
      logging: LogDriver.awsLogs({
        streamPrefix: "proxy",
      }),
    });

    gatewayTaskDefinition.addToTaskRolePolicy(
      new PolicyStatement({
        effect: Effect.ALLOW,
        actions: ["appmesh:StreamAggregatedResources"],
        resources: [`${mesh.meshArn}*`],
      })
    );

    const gatewayService = new NetworkLoadBalancedFargateService(
      this,
      "GatewayService",
      {
        cluster: cluster,
        taskDefinition: gatewayTaskDefinition,
        assignPublicIp: true,
      }
    );

    securityGroup.connections.allowFrom(gatewayService.service, Port.allTcp());
    gatewayService.service.connections.allowFrom(securityGroup, Port.allTcp());
    gatewayService.service.connections.allowFrom(
      Peer.ipv4(cluster.vpc.vpcCidrBlock),
      Port.allTcp()
    );
  }
}
