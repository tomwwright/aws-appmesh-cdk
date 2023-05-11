import { Peer } from "aws-cdk-lib/aws-ec2";

export const externalAccess = Peer.ipv4("139.218.174.36/32");
