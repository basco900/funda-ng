"use client";
import { useState, useTransition } from "react";
import { addCustomerNote, updateCustomerControl } from "../../actions";
import styles from "../../../admin.module.css";

export default function CustomerActions({ userId, accountStatus, walletStatus, riskLevel }: { userId: string; accountStatus: string; walletStatus: string; riskLevel: string }) {
  const [note, setNote] = useState(""); const [message, setMessage] = useState(""); const [pending, startTransition] = useTransition();
  return <article className={styles.workspacePanel}><div className={styles.panelHeader}><h2>Safe actions</h2></div><div className={styles.customerActions}><textarea value={note} onChange={(event)=>setNote(event.target.value)} placeholder="Add an internal note…" /><button type="button" className={styles.primaryButton} disabled={pending||note.trim().length<2} onClick={()=>startTransition(async()=>{const result=await addCustomerNote({userId,note});setMessage(result.message);if(result.ok)setNote("")})}>Save note</button><button type="button" className={styles.secondaryButton} disabled={pending} onClick={()=>startTransition(async()=>{const next=accountStatus==="active"?"review":"active";const result=await updateCustomerControl({userId,accountStatus:next,walletStatus,riskLevel,restrictionReason:next==="review"?"Administrative review requested":"Account restored after review"});setMessage(result.message)})}>{accountStatus==="active"?"Place under review":"Restore account"}</button>{message?<p>{message}</p>:null}</div></article>;
}
