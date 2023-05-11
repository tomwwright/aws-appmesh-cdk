import { Peer } from "aws-cdk-lib/aws-ec2";

export const externalAccess = Peer.ipv4("192.168.1.1/32");
