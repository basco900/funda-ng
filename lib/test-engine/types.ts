export type VendorId = "vtpass" | "smeplug" | "pairgate" | "absvendor" | "maskawasub";
export type NetworkId = "mtn" | "airtel" | "glo" | "9mobile";
export type ServiceType = "data" | "airtime" | "electricity" | "tv" | "education";
export type AirtimeMode = "vtu" | "epin";

export type RechargePinItem = {
  pin: string;
  serial?: string;
  amount: number;
  network?: NetworkId | string;
  dialCode?: string;
  instructions?: string;
};

export type EducationPinItem = {
  pin: string;
  serial?: string;
  token?: string;
  examBody: string;
  serviceName: string;
  instructions?: string;
};

export type DataPlan = {
  id: string;
  name: string;
  amount: number;
  network: NetworkId;
  vendor: VendorId;
  validity?: string | null;
  raw?: unknown;
};

export type PurchaseInput = {
  type: ServiceType;
  mode?: AirtimeMode;
  network?: NetworkId;
  phone: string;
  email?: string;
  amount: number;
  quantity?: number;
  cardName?: string;
  planId?: string;
  reference: string;
  disco?: string;
  meterNumber?: string;
  meterType?: "prepaid" | "postpaid";
  customerName?: string;
  customerAddress?: string;
  operator?: string;
  smartcardNumber?: string;
  packageCode?: string;
  subscriptionType?: "change" | "renew";
  // Education fields
  examBody?: string;
  serviceCode?: string;
  profileCode?: string;
  candidateName?: string;
};

export type PurchaseResult = {
  status: "successful" | "pending" | "failed";
  reference: string;
  providerReference?: string;
  message: string;
  pins?: RechargePinItem[];
  educationPins?: EducationPinItem[];
  token?: string;
  units?: string;
  raw?: unknown;
};

export interface VtuVendor {
  id: VendorId;
  isConfigured(): boolean;
  getDataPlans(network: NetworkId): Promise<DataPlan[]>;
  purchase(input: PurchaseInput): Promise<PurchaseResult>;
  requery(reference: string): Promise<PurchaseResult>;
}
