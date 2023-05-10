import { IConnectable, Port, SecurityGroup } from "aws-cdk-lib/aws-ec2";
import { Cluster } from "aws-cdk-lib/aws-ecs";
import { INamespace } from "aws-cdk-lib/aws-servicediscovery";
import { Construct } from "constructs";

interface Props {
  namespaceName: string;
  externalAccess: IConnectable;
}

export class ServiceConnectCluster extends Construct {
  public readonly cluster: Cluster;
  public readonly namespace: INamespace;
  public readonly securityGroup: SecurityGroup;

  constructor(scope: Construct, id: string, props: Props) {
    super(scope, id);

    const { namespaceName } = props;

    this.cluster = new Cluster(this, `Cluster`, {
      clusterName: namespaceName,
      defaultCloudMapNamespace: {
        name: namespaceName,
        useForServiceConnect: true,
      },
    });

    if (this.cluster.defaultCloudMapNamespace) {
      this.namespace = this.cluster.defaultCloudMapNamespace;
    } else {
      throw new Error("No CloudMap namespace available!");
    }
    this.namespace = this.cluster.defaultCloudMapNamespace;

    this.securityGroup = new SecurityGroup(this, "SecurityGroup", {
      vpc: this.cluster.vpc,
      allowAllOutbound: true,
    });

    this.securityGroup.connections.allowFrom(
      props.externalAccess,
      Port.allTcp()
    );
    this.securityGroup.connections.allowFrom(this.securityGroup, Port.allTcp());
  }
}
