export type ProposedChange = {
  file: string;
  action: "modify" | "create" | "delete";
  reason: string;
  original_code: string;
  proposed_code: string;
};

export type EditProposal = {
  summary: string;
  changes: ProposedChange[];
};