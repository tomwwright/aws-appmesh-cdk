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

    // create ourselves an empty stack to hold our resources

    const stack = new Stack(this, namespaceName);

    /**
     * create our ECS Cluster that is configured to use ECS Service Connect
     *
     * `cluster` our ECS Cluster with underlying default VPC
     * `namespace` our Cloud Map namespace created by ECS Service Connect
     * `securityGroup` security group accessible from our IP to make things easy
     **/

    const { cluster, namespace, securityGroup } = new ServiceConnectCluster(
      stack,
      "Cluster",
      {
        namespaceName,
        externalAccess,
      }
    );

    /**
     * create two ECS Services, "blue" and "green", running our sample Express.js
     * application that are configured to use ECS Service Connect
     *
     * we can use the /downstream endpoint of our sample application to explore
     * how these services are able to discover and route traffic to each other
     * as they have been connected to the same namespace
     **/

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
