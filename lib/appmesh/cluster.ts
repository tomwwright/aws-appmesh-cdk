import { IConnectable, Port, SecurityGroup } from "aws-cdk-lib/aws-ec2";
import { Cluster } from "aws-cdk-lib/aws-ecs";
import {
  INamespace,
  PrivateDnsNamespace,
} from "aws-cdk-lib/aws-servicediscovery";
import {
  AwsCustomResource,
  AwsCustomResourcePolicy,
  PhysicalResourceId,
} from "aws-cdk-lib/custom-resources";
import { Construct } from "constructs";

interface Props {
  namespaceName: string;
  externalAccess: IConnectable;
}

export class AppMeshCluster extends Construct {
  public readonly cluster: Cluster;
  public readonly namespace: INamespace;
  public readonly securityGroup: SecurityGroup;

  constructor(scope: Construct, id: string, props: Props) {
    super(scope, id);

    const { namespaceName } = props;

    this.cluster = new Cluster(this, `Cluster`, {
      clusterName: namespaceName,
    });

    this.namespace = new PrivateDnsNamespace(this, "Namespace", {
      name: namespaceName,
      vpc: this.cluster.vpc,
    });

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
