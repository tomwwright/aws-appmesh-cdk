import { IConnectable } from "aws-cdk-lib/aws-ec2";
import { App, Stack } from "aws-cdk-lib";
import { ServiceConnectCluster } from "./serviceconnect/cluster";
import { ServiceConnectExpress } from "./serviceconnect/express";

interface Props {
  namespaceName: string;
  externalAccess: IConnectable;
}

export class ServiceConnectApp extends App {
  constructor(props: Props) {
    super();

    const { namespaceName, externalAccess } = props;

    const stack = new Stack(this, namespaceName);

    const clusterStack = new ServiceConnectCluster(stack, "Cluster", {
      namespaceName,
      externalAccess,
    });

    const { cluster, namespace, securityGroup } = clusterStack;

    new ServiceConnectExpress(stack, "Blue", {
      serviceName: "blue",
      cluster,
      namespace,
      securityGroup,
    });

    new ServiceConnectExpress(stack, "Green", {
      serviceName: "green",
      cluster,
      namespace,
      securityGroup,
    });
  }
}
