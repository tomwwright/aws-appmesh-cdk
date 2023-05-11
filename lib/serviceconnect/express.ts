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

    /**
     * preparing a task definition for use with ECS Service Connect requires
     * adding some details to our `portMappings`
     *
     * see `name` and `appProtocol` added below that allow ECS Service Connect make
     * that container port discoverable
     */

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

    /**
     * configuring a service for use with ECS Service Connect requires adding
     * configuration under `serviceConnectConfiguration`
     *
     * `namespace` defines which namespace to connect to
     *
     * `services` defines the list of things to register -- see how the
     * `portMappingName` configured in our task definition is wired
     * up for service discovery using `discoveryName` ("blue" or "green")
     *
     * end result: "blue.serviceconnect" available via service discovery
     *
     * this configuration is used to configure an Envoy proxy that is injected
     * into the service
     */

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
