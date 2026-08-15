export type VendorId = "vtpass" | "smeplug" | "gladtidings" | "pairgate";
export type NetworkId = "mtn" | "airtel" | "glo" | "9mobile";
export type ServiceType = "data" | "airtime";

export type DataPlan = {
  id: string;
  name: string;
  amount: number;
  network: NetworkId;
  vendor: VendorId;
};

export type PurchaseInput = {
  type: ServiceType;
  network: NetworkId;
  phone: string;
  amount: number;
  planId?: string;
  reference: string;
};

export type PurchaseResult = {
  status: "successful" | "pending" | "failed";
  reference: string;
  providerReference?: string;
  message: string;
  raw?: unknown;
};

export interface VtuVendor {
  id: VendorId;
  isConfigured(): boolean;
  getDataPlans(network: NetworkId): Promise<DataPlan[]>;
  purchase(input: PurchaseInput): Promise<PurchaseResult>;
  requery(reference: string): Promise<PurchaseResult>;
}
