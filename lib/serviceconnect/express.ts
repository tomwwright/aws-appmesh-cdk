import { ISecurityGroup } from "aws-cdk-lib/aws-ec2";
import {
  AppProtocol,
  Cluster,
  ContainerImage,
  FargateService,
  FargateTaskDefinition,
  LogDriver,
  Protocol,
} from "aws-cdk-lib/aws-ecs";
import { IHttpNamespace } from "aws-cdk-lib/aws-servicediscovery";
import { Construct } from "constructs";

interface Props {
  serviceName: string;
  cluster: Cluster;
  namespace: IHttpNamespace;
  securityGroup: ISecurityGroup;
}

export class ServiceConnectExpress extends Construct {
  constructor(scope: Construct, id: string, props: Props) {
    super(scope, id);

    const { cluster, namespace, serviceName, securityGroup } = props;

    const taskDefinition = new FargateTaskDefinition(this, "TaskDefinition");
    taskDefinition.addContainer("expressjs", {
      image: ContainerImage.fromAsset("expressjs"),
      command: ["serve:js"],
      logging: LogDriver.awsLogs({ streamPrefix: "expressjs" }),
      environment: {
        SERVICE_NAME: serviceName,
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

    new FargateService(this, "Service", {
      cluster,
      taskDefinition,
      serviceConnectConfiguration: {
        namespace: namespace.namespaceName,
        services: [
          {
            portMappingName: "expressjs",
            discoveryName: serviceName,
          },
        ],
        logDriver: LogDriver.awsLogs({
          streamPrefix: "proxy",
        }),
      },
      assignPublicIp: true,
      securityGroups: [securityGroup],
    });
  }
}
