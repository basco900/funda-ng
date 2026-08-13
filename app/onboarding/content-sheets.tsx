"use client";

import { useState } from "react";
import {
  AboutInfoIcon,
  ArrowRightIcon,
  ArrowUpRightIcon,
  BoltIcon,
  CheckIcon,
  ChevronDownIcon,
  ContactChatIcon,
  FaqHelpIcon,
  LockIcon,
  PhoneIcon,
  PoliciesShieldIcon,
  ServicesGridIcon,
  ShieldIcon,
  SignalIcon,
  SparklesIcon,
  TvIcon,
} from "./icons";
import styles from "./content-sheets.module.css";

export type SheetType = "about" | "services" | "contact" | "policies" | "faq" | "privacy" | "terms" | "refunds";

interface ContentSheetsProps {
  type: SheetType;
  onNavigate: (type: SheetType) => void;
  onOpenAuth: (mode: "login" | "register") => void;
}

export function ContentSheetView({ type, onNavigate, onOpenAuth }: ContentSheetsProps) {
  switch (type) {
    case "about":
      return <AboutSheetContent onNavigate={onNavigate} onOpenAuth={onOpenAuth} />;
    case "services":
      return <ServicesSheetContent onOpenAuth={onOpenAuth} />;
    case "contact":
      return <ContactSheetContent />;
    case "policies":
    case "privacy":
    case "terms":
    case "refunds":
      return <PoliciesSheetContent initialTab={type === "policies" ? "privacy" : type} onNavigate={onNavigate} />;
    case "faq":
      return <FaqSheetContent onNavigate={onNavigate} />;
    default:
      return <AboutSheetContent onNavigate={onNavigate} onOpenAuth={onOpenAuth} />;
  }
}

// ----------------------------------------------------
// ABOUT CONTENT
// ----------------------------------------------------
function AboutSheetContent({ onNavigate, onOpenAuth }: { onNavigate: (type: SheetType) => void; onOpenAuth: (mode: "login" | "register") => void }) {
  return (
    <div className={styles.container}>
      <div className={styles.heroBadge}>
        <SparklesIcon size={14} />
        <span>Funda Experience · Built for Nigeria</span>
      </div>

      <h1 className={styles.title}>Life, funded without the friction.</h1>
      <p className={styles.subtitle}>
        Funda is the minimalist everyday billing companion designed to eliminate queue stress, high charges, and failed utility payments.
      </p>

      {/* Metric Cards */}
      <div className={styles.statsGrid}>
        <div className={styles.statCard}>
          <span className={styles.statNumber}>99.9%</span>
          <span className={styles.statLabel}>Uptime guarantee</span>
        </div>
        <div className={styles.statCard}>
          <span className={styles.statNumber}>&lt; 3s</span>
          <span className={styles.statLabel}>Instant top-up speed</span>
        </div>
        <div className={styles.statCard}>
          <span className={styles.statNumber}>₦0</span>
          <span className={styles.statLabel}>Hidden maintenance fee</span>
        </div>
        <div className={styles.statCard}>
          <span className={styles.statNumber}>24/7</span>
          <span className={styles.statLabel}>Real-time dispute resolution</span>
        </div>
      </div>

      {/* Feature Cards */}
      <div className={styles.sectionHeader}>
        <AboutInfoIcon size={18} />
        <h2>What sets Funda apart</h2>
      </div>

      <div className={styles.featureList}>
        <div className={styles.featureItem}>
          <div className={styles.featureIcon}>
            <SignalIcon size={20} />
          </div>
          <div>
            <h3>Direct Telco & Utility API</h3>
            <p>We connect directly to MTN, Airtel, Glo, 9mobile, and discos for near-instant dispatch without intermediaries.</p>
          </div>
        </div>

        <div className={styles.featureItem}>
          <div className={styles.featureIcon}>
            <ShieldIcon size={20} />
          </div>
          <div>
            <h3>Bank-Grade Security</h3>
            <p>End-to-end encrypted sessions with biometric PIN access, zero storage of debit cards, and NDPR compliance.</p>
          </div>
        </div>

        <div className={styles.featureItem}>
          <div className={styles.featureIcon}>
            <LockIcon size={20} />
          </div>
          <div>
            <h3>Automated Refund Safeguard</h3>
            <p>If a token delivery fails at the provider end, your Funda balance is reversed within seconds automatically.</p>
          </div>
        </div>
      </div>

      {/* CTA Box */}
      <div className={styles.ctaBox}>
        <h3>Ready to experience seamless utilities?</h3>
        <p>Join thousands of Nigerians managing their data, airtime, and electricity effortlessly.</p>
        <div className={styles.ctaButtonGroup}>
          <button type="button" className={styles.primaryBtn} onClick={() => onOpenAuth("register")}>
            Get started <ArrowRightIcon size={16} />
          </button>
          <button type="button" className={styles.ashBtn} onClick={() => onNavigate("services")}>
            View services
          </button>
        </div>
      </div>
    </div>
  );
}

// ----------------------------------------------------
// SERVICES CONTENT
// ----------------------------------------------------
function ServicesSheetContent({ onOpenAuth }: { onOpenAuth: (mode: "login" | "register") => void }) {
  const [selectedCategory, setSelectedCategory] = useState<string>("data");

  const services = [
    {
      id: "data",
      title: "Mobile Data Bundles",
      icon: <SignalIcon size={22} />,
      badge: "SME & Direct",
      desc: "Buy SME, Gifting, and Corporate Data bundles across all major Nigerian networks with up to 30% savings.",
      providers: ["MTN Nigeria", "Airtel Nigeria", "Glo Mobile", "9mobile"],
      highlights: ["Instant auto-crediting", "Balances valid up to 30 days", "Rollover supported"],
    },
    {
      id: "airtime",
      title: "Airtime Top-Up",
      icon: <PhoneIcon size={22} />,
      badge: "Zero Fee",
      desc: "Recharge any line instantly. No extra charge, instant VTU delivery, and auto-retry if line is busy.",
      providers: ["MTN", "Airtel", "Glo", "9mobile"],
      highlights: ["VTU Instant Credit", "100% bonus eligibility", "Bulk recharge option"],
    },
    {
      id: "electricity",
      title: "Electricity Tokens",
      icon: <BoltIcon size={22} />,
      badge: "Prepaid & Postpaid",
      desc: "Pay for electricity tokens across all distribution companies (DisCos) and retrieve meter tokens instantly.",
      providers: ["IKEDC (Ikeja)", "EKEDC (Eko)", "AEDC (Abuja)", "IBEDC (Ibadan)", "KEDCO (Kano)", "PHED"],
      highlights: ["Token printed on screen", "Instant SMS notification", "Meter validation before payment"],
    },
    {
      id: "cable",
      title: "Cable TV Subscription",
      icon: <TvIcon size={22} />,
      badge: "Instant Renewal",
      desc: "Renew DStv, GOtv, and Startimes packages or upgrade bouquets without leaving your desk.",
      providers: ["DStv Premium/Compact", "GOtv Max/Jolli", "StarTimes Nova/Basic"],
      highlights: ["Account name preview", "Smartcard verification", "Instant clearance of error codes"],
    },
  ];

  return (
    <div className={styles.container}>
      <div className={styles.heroBadge}>
        <ServicesGridIcon size={14} />
        <span>Utilities & Digital Payments</span>
      </div>

      <h1 className={styles.title}>All your bills, simplified into one app.</h1>
      <p className={styles.subtitle}>
        Transparent pricing, zero hidden charges, and real-time confirmation on every transaction.
      </p>

      {/* Category Pill Selector */}
      <div className={styles.categoryPills}>
        {services.map((s) => (
          <button
            key={s.id}
            type="button"
            className={`${styles.pill} ${selectedCategory === s.id ? styles.pillActive : ""}`}
            onClick={() => setSelectedCategory(s.id)}
          >
            {s.title}
          </button>
        ))}
      </div>

      {/* Active Service Card */}
      {services.map((item) => {
        if (item.id !== selectedCategory) return null;
        return (
          <div key={item.id} className={styles.serviceDetailCard}>
            <div className={styles.serviceCardHeader}>
              <div className={styles.serviceIconWrap}>{item.icon}</div>
              <div>
                <span className={styles.ashBadge}>{item.badge}</span>
                <h3>{item.title}</h3>
              </div>
            </div>

            <p className={styles.serviceDesc}>{item.desc}</p>

            <div className={styles.providerSection}>
              <h4>Supported Networks & Operators</h4>
              <div className={styles.providerTags}>
                {item.providers.map((p) => (
                  <span key={p} className={styles.providerTag}>
                    <CheckIcon size={12} /> {p}
                  </span>
                ))}
              </div>
            </div>

            <div className={styles.highlightsSection}>
              <h4>Key Features</h4>
              <ul>
                {item.highlights.map((h, i) => (
                  <li key={i}>
                    <span className={styles.bulletDot} />
                    {h}
                  </li>
                ))}
              </ul>
            </div>

            <button type="button" className={styles.fullWidthBtn} onClick={() => onOpenAuth("login")}>
              Pay for {item.title} <ArrowRightIcon size={16} />
            </button>
          </div>
        );
      })}
    </div>
  );
}

// ----------------------------------------------------
// CONTACT & SUPPORT CONTENT
// ----------------------------------------------------
function ContactSheetContent() {
  const [formSubmitted, setFormSubmitted] = useState(false);
  const [message, setMessage] = useState("");
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!message || !email) return;
    setFormSubmitted(true);
  };

  return (
    <div className={styles.container}>
      <div className={styles.heroBadge}>
        <ContactChatIcon size={14} />
        <span>24/7 Human Support</span>
      </div>

      <h1 className={styles.title}>We&apos;re here whenever you need us.</h1>
      <p className={styles.subtitle}>
        Have questions about a meter token, pending data delivery, or business integration? Reach out directly.
      </p>

      {/* Contact Channels */}
      <div className={styles.channelGrid}>
        <a href="https://wa.me/2348000000000" target="_blank" rel="noreferrer" className={styles.channelCard}>
          <div className={styles.channelIcon}>
            <ContactChatIcon size={20} />
          </div>
          <div className={styles.channelInfo}>
            <h4>WhatsApp Support</h4>
            <span>Instant responses & token lookup</span>
          </div>
          <ArrowUpRightIcon size={16} className={styles.channelArrow} />
        </a>

        <a href="mailto:support@funda.ng" className={styles.channelCard}>
          <div className={styles.channelIcon}>
            <AboutInfoIcon size={20} />
          </div>
          <div className={styles.channelInfo}>
            <h4>Email Support</h4>
            <span>support@funda.ng</span>
          </div>
          <ArrowUpRightIcon size={16} className={styles.channelArrow} />
        </a>
      </div>

      {/* Message Form */}
      <div className={styles.contactFormBox}>
        <h3>Send us a message</h3>
        {formSubmitted ? (
          <div className={styles.formSuccessState}>
            <CheckIcon size={28} />
            <h4>Message Received</h4>
            <p>Thanks for reaching out! Our support team typically responds in under 15 minutes.</p>
            <button type="button" className={styles.ashBtn} onClick={() => setFormSubmitted(false)}>
              Send another message
            </button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className={styles.form}>
            <div className={styles.fieldGroup}>
              <label htmlFor="contact-name">Full name</label>
              <input
                id="contact-name"
                type="text"
                placeholder="e.g. Tunde Balogun"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </div>

            <div className={styles.fieldGroup}>
              <label htmlFor="contact-email">Email or Phone Number</label>
              <input
                id="contact-email"
                type="text"
                placeholder="08012345678 or you@domain.com"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>

            <div className={styles.fieldGroup}>
              <label htmlFor="contact-message">How can we help?</label>
              <textarea
                id="contact-message"
                rows={3}
                placeholder="Describe your question or issue..."
                required
                value={message}
                onChange={(e) => setMessage(e.target.value)}
              />
            </div>

            <button type="submit" className={styles.primaryBtn}>
              Submit message <ArrowRightIcon size={16} />
            </button>
          </form>
        )}
      </div>
    </div>
  );
}

// ----------------------------------------------------
// POLICIES CONTENT (Privacy, Terms, Refunds)
// ----------------------------------------------------
function PoliciesSheetContent({ initialTab = "privacy", onNavigate }: { initialTab: "privacy" | "terms" | "refunds"; onNavigate: (type: SheetType) => void }) {
  const [activeTab, setActiveTab] = useState<"privacy" | "terms" | "refunds">(initialTab);

  return (
    <div className={styles.container}>
      <div className={styles.heroBadge}>
        <PoliciesShieldIcon size={14} />
        <span>Legal, Security & Compliance</span>
      </div>

      <h1 className={styles.title}>Trust built on total transparency.</h1>
      <p className={styles.subtitle}>
        Review our simple, plain-English policies covering data privacy, terms of service, and refund guarantees.
      </p>

      {/* Tabs */}
      <div className={styles.segmentedTabs}>
        <button
          type="button"
          className={`${styles.tabBtn} ${activeTab === "privacy" ? styles.tabBtnActive : ""}`}
          onClick={() => { setActiveTab("privacy"); onNavigate("privacy"); }}
        >
          Privacy Policy
        </button>
        <button
          type="button"
          className={`${styles.tabBtn} ${activeTab === "terms" ? styles.tabBtnActive : ""}`}
          onClick={() => { setActiveTab("terms"); onNavigate("terms"); }}
        >
          Terms of Use
        </button>
        <button
          type="button"
          className={`${styles.tabBtn} ${activeTab === "refunds" ? styles.tabBtnActive : ""}`}
          onClick={() => { setActiveTab("refunds"); onNavigate("refunds"); }}
        >
          Refund Guarantee
        </button>
      </div>

      {/* Policy Text Container */}
      <div className={styles.policyBody}>
        {activeTab === "privacy" && (
          <div className={styles.policyArticle}>
            <h2>Privacy Policy</h2>
            <span className={styles.lastUpdated}>Last Updated: August 2026</span>

            <h3>1. Information We Collect</h3>
            <p>
              We collect your phone number and transaction metadata necessary to deliver your mobile data, airtime, and utility tokens. We do NOT store your bank card PINs or full account numbers.
            </p>

            <h3>2. How We Use Data</h3>
            <p>
              Your phone number is used exclusively for account authentication (via OTP) and transaction status notifications. We never sell your personal contact information to third-party advertisers.
            </p>

            <h3>3. Data Encryption</h3>
            <p>
              All traffic between your mobile device and our backend servers is encrypted via TLS 1.3 encryption standards.
            </p>
          </div>
        )}

        {activeTab === "terms" && (
          <div className={styles.policyArticle}>
            <h2>Terms of Service</h2>
            <span className={styles.lastUpdated}>Last Updated: August 2026</span>

            <h3>1. Account Access</h3>
            <p>
              You are responsible for keeping your phone number and OTP access code secure. Funda will never ask for your authentication codes over phone or social media.
            </p>

            <h3>2. Service Availability</h3>
            <p>
              While Funda maintains over 99.9% platform availability, utility token delivery depends on third-party electricity DisCos and mobile network operators.
            </p>

            <h3>3. Transaction Finality</h3>
            <p>
              Once a data or airtime bundle is dispatched to a verified telephone number provided by you, it cannot be reversed unless a network failure occurs.
            </p>
          </div>
        )}

        {activeTab === "refunds" && (
          <div className={styles.policyArticle}>
            <h2>Automated Refund Policy</h2>
            <span className={styles.lastUpdated}>Last Updated: August 2026</span>

            <h3>1. Failed Transactions</h3>
            <p>
              If money is debited from your account but the utility operator fails to generate a token or credit your line within 120 seconds, our system automatically initiates a 100% wallet reversal.
            </p>

            <h3>2. Wrong Meter or Phone Numbers</h3>
            <p>
              Funda automatically verifies meter names with DisCos before charging. If an incorrect meter number is entered by the user, please contact support immediately before processing.
            </p>

            <h3>3. Support Escalations</h3>
            <p>
              If a refund does not show up automatically, contact support via WhatsApp or email with your Transaction ID for manual review within 24 hours.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

// ----------------------------------------------------
// FAQ CONTENT
// ----------------------------------------------------
function FaqSheetContent({ onNavigate }: { onNavigate: (type: SheetType) => void }) {
  const [openIndex, setOpenIndex] = useState<number | null>(0);

  const faqs = [
    {
      q: "How fast will my data or airtime arrive?",
      a: "Delivered instantly in 2-5 seconds. Once payment confirms, our direct API dispatches the bundle directly to your line.",
    },
    {
      q: "What if I don't receive my electricity token?",
      a: "Tokens are displayed right on your screen and saved in your transaction receipt. If a DisCo network delay occurs, your token will also be sent via SMS automatically.",
    },
    {
      q: "Are there any hidden fees when buying data or electricity?",
      a: "No hidden charges! What you see is exactly what you pay. We offer discounted rates on data and standard tariffs on electricity.",
    },
    {
      q: "How do I check my remaining data balance?",
      a: "Dial *312# (MTN), *140# (Airtel), *310# (Glo), or *228# (9mobile) on your device to inspect your balance.",
    },
    {
      q: "Is Funda safe to use for daily payments?",
      a: "Yes! Funda uses bank-grade 256-bit encryption and NDPR-certified data handling. Your payment information is completely protected.",
    },
  ];

  return (
    <div className={styles.container}>
      <div className={styles.heroBadge}>
        <FaqHelpIcon size={14} />
        <span>Help & Answers</span>
      </div>

      <h1 className={styles.title}>Frequently asked questions.</h1>
      <p className={styles.subtitle}>
        Quick answers to common questions about buying data, airtime, and utility tokens on Funda.
      </p>

      <div className={styles.faqAccordion}>
        {faqs.map((item, idx) => {
          const isOpen = openIndex === idx;
          return (
            <div key={idx} className={`${styles.faqItem} ${isOpen ? styles.faqItemOpen : ""}`}>
              <button
                type="button"
                className={styles.faqQuestionBtn}
                onClick={() => setOpenIndex(isOpen ? null : idx)}
              >
                <span>{item.q}</span>
                <ChevronDownIcon size={18} className={`${styles.chevron} ${isOpen ? styles.chevronRotated : ""}`} />
              </button>

              {isOpen && <div className={styles.faqAnswer}><p>{item.a}</p></div>}
            </div>
          );
        })}
      </div>

      <div className={styles.moreQuestionsBox}>
        <h4>Still have a question?</h4>
        <p>Our team is available 24/7 to help you resolve any issues.</p>
        <button type="button" className={styles.ashBtn} onClick={() => onNavigate("contact")}>
          Contact Support <ArrowRightIcon size={16} />
        </button>
      </div>
    </div>
  );
}
