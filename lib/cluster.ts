import { Cluster } from "aws-cdk-lib/aws-ecs";
import { INamespace } from "aws-cdk-lib/aws-servicediscovery";
import {
  AwsCustomResource,
  AwsCustomResourcePolicy,
  PhysicalResourceId,
} from "aws-cdk-lib/custom-resources";
import { Construct } from "constructs";

interface Props {
  namespaceName: string;
}

export class ClusterConstruct extends Construct {
  public readonly cluster: Cluster;
  public readonly namespace: INamespace;
  public readonly httpNamespaceName: string;

  constructor(scope: Construct, id: string, props: Props) {
    super(scope, id);

    const { namespaceName } = props;

    this.cluster = new Cluster(this, `Cluster`, {
      defaultCloudMapNamespace: {
        name: namespaceName,
        useForServiceConnect: false,
      },
    });

    if (this.cluster.defaultCloudMapNamespace) {
      this.namespace = this.cluster.defaultCloudMapNamespace;
    } else {
      throw new Error("No CloudMap namespace available!");
    }

    const httpNamespaceProperties = new AwsCustomResource(
      this,
      "HttpNamespaceProperties",
      {
        onCreate: {
          service: "ServiceDiscovery",
          action: "getNamespace",
          parameters: {
            Id: this.cluster.defaultCloudMapNamespace.namespaceId,
          },
          physicalResourceId: PhysicalResourceId.of(
            this.cluster.defaultCloudMapNamespace.namespaceId
          ),
        },
        policy: AwsCustomResourcePolicy.fromSdkCalls({
          resources: AwsCustomResourcePolicy.ANY_RESOURCE,
        }),
      }
    );

    this.httpNamespaceName = httpNamespaceProperties.getResponseField(
      "Namespace.Properties.HttpProperties.HttpName"
    );

    // // using cluster.defaultCloudMapNamespace triggers a second namespace
    // // to be created
    // (this.cluster.node.defaultChild as CfnCluster).serviceConnectDefaults = {
    //   namespace: namespaceName,
    // };

    // static values referenced post-deployment
    // this.namespace = HttpNamespace.fromHttpNamespaceAttributes(
    //   this,
    //   "CloudMapNamespace",
    //   {
    //     namespaceName: namespaceName,
    //     namespaceArn:
    //       "arn:aws:servicediscovery:ap-southeast-2:933397847440:namespace/ns-o5kkmci35fplksrk",
    //     namespaceId: "ns-o5kkmci35fplksrk",
    //   }
    // );
  }
}
