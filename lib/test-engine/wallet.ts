type TestWallet = {
  balance: number;
  creditedPayments: Set<string>;
  debitedOrders: Set<string>;
};

const walletGlobal = globalThis as typeof globalThis & { __testWallet?: TestWallet };
export const testWallet = walletGlobal.__testWallet ??= {
  balance: Number(process.env.TEST_WALLET_OPENING_BALANCE || 10_000),
  creditedPayments: new Set<string>(),
  debitedOrders: new Set<string>(),
};

export function creditWallet(paymentReference: string, amount: number) {
  if (testWallet.creditedPayments.has(paymentReference)) return testWallet.balance;
  testWallet.balance = Math.round((testWallet.balance + amount) * 100) / 100;
  testWallet.creditedPayments.add(paymentReference);
  return testWallet.balance;
}

export function debitWallet(orderReference: string, amount: number) {
  if (testWallet.debitedOrders.has(orderReference)) return testWallet.balance;
  if (testWallet.balance < amount) throw new Error("Insufficient test wallet balance. Fund the wallet first.");
  testWallet.balance = Math.round((testWallet.balance - amount) * 100) / 100;
  testWallet.debitedOrders.add(orderReference);
  return testWallet.balance;
}

export function refundWallet(orderReference: string, amount: number) {
  if (!testWallet.debitedOrders.delete(orderReference)) return testWallet.balance;
  testWallet.balance = Math.round((testWallet.balance + amount) * 100) / 100;
  return testWallet.balance;
}
