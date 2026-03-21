declare module "officeparser" {
  export type ParsedOfficeDocument = Readonly<{
    toText(): string;
  }>;

  const officeParser: Readonly<{
    parseOffice(buffer: Buffer): Promise<ParsedOfficeDocument>;
  }>;

  export default officeParser;
}
