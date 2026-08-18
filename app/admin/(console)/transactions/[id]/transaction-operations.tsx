"use client";

import { useState, useTransition } from "react";
import { queueProviderRequery } from "../../actions";
import styles from "../../../admin.module.css";

export default function TransactionOperations({ transactionId, status }: { transactionId: string; status: string }) {
  const [message, setMessage] = useState("");
  const [pending, startTransition] = useTransition();
  const terminal = ["successful", "refunded", "reversed", "cancelled"].includes(status);
  return <article className={styles.workspacePanel}><div className={styles.panelHeader}><h2>Provider recovery</h2></div><div className={styles.customerActions}><p>{terminal ? "This transaction is final and cannot be re-queried." : "Ask the configured provider for a fresh status without charging the customer again."}</p><button type="button" className={styles.secondaryButton} disabled={pending || terminal} onClick={() => startTransition(async () => { const result = await queueProviderRequery({ transactionId, reason: "Operator requested a fresh provider status." }); setMessage(result.message); })}>{pending ? "Queuing…" : "Queue safe requery"}</button>{message ? <p>{message}</p> : null}</div></article>;
}
