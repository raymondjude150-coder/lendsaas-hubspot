// LendSaaS → HubSpot Middleware
// Deployed on Vercel as a serverless function

const HUBSPOT_ACCESS_TOKEN = process.env.HUBSPOT_ACCESS_TOKEN;
const HUBSPOT_PIPELINE_ID = process.env.HUBSPOT_PIPELINE_ID || "default";
const HUBSPOT_BASE_URL = "https://api.hubapi.com";

// ─── HubSpot Stage IDs (Real IDs from FundPro HubSpot Pipeline) ──────────────
const STAGE_IDS = {
  NEW_APPLICATION:  "3578037987",
  UNDER_REVIEW:     "3578037986",
  APPROVED:         "3578037988",
  FUNDED:           "3578037989",
  BOUNCED_PAYMENT:  "3578037990",
  CLOSED_LOST:      "3578037991",
  PERFORMING:       "3621934781",
  MONITORING_BOUNCE:"3618264782",
};

// ─── Stage Mapping ───────────────────────────────────────────────────────────
const STAGE_MAP = {

  // ── New Application
  "new":                                          STAGE_IDS.NEW_APPLICATION,
  "new lead":                                     STAGE_IDS.NEW_APPLICATION,
  "lead created":                                 STAGE_IDS.NEW_APPLICATION,

  // ── Under Review
  "pending":                                      STAGE_IDS.UNDER_REVIEW,
  "in review \u2013 pending action":              STAGE_IDS.UNDER_REVIEW,
  "in review - pending action":                   STAGE_IDS.UNDER_REVIEW,
  "under review":                                 STAGE_IDS.UNDER_REVIEW,
  "in review":                                    STAGE_IDS.UNDER_REVIEW,
  "review":                                       STAGE_IDS.UNDER_REVIEW,

  // ── Approved
  "approved":                                     STAGE_IDS.APPROVED,

  // ── Funded
  "funded":                                       STAGE_IDS.FUNDED,
  "manual pay \u2013 active monitoring":          STAGE_IDS.FUNDED,
  "manual pay - active monitoring":               STAGE_IDS.FUNDED,
  "performing - paying off schedule":             STAGE_IDS.FUNDED,
  "settlement plan \u2013 performing":            STAGE_IDS.FUNDED,
  "settlement plan - performing":                 STAGE_IDS.FUNDED,
  "temporary pause \u2013 merchant request":      STAGE_IDS.FUNDED,
  "temporary pause - merchant request":           STAGE_IDS.FUNDED,
  "modified \u2013 permanent adjustment":         STAGE_IDS.FUNDED,
  "modified - permanent adjustment":              STAGE_IDS.FUNDED,
  "modified \u2013 temporary payment plan":       STAGE_IDS.FUNDED,
  "modified - temporary payment plan":            STAGE_IDS.FUNDED,
  "in reconcilliation":                           STAGE_IDS.FUNDED,
  "in reconciliation":                            STAGE_IDS.FUNDED,

  // ── Performing
  "performing":                                   STAGE_IDS.PERFORMING,

  // ── Monitoring Bounce Monster
  "monitoring \u2013 bounce monster":             STAGE_IDS.MONITORING_BOUNCE,
  "monitoring - bounce monster":                  STAGE_IDS.MONITORING_BOUNCE,
  "monitoring- bounce monster":                   STAGE_IDS.MONITORING_BOUNCE,
  "monitoring-bounce monster":                    STAGE_IDS.MONITORING_BOUNCE,

  // ── Bounced Payment
  "bounced payment":                              STAGE_IDS.BOUNCED_PAYMENT,
  "bounced":                                      STAGE_IDS.BOUNCED_PAYMENT,
  "bounce \u2013 in communication (negotiating)": STAGE_IDS.BOUNCED_PAYMENT,
  "bounce - in communication (negotiating)":      STAGE_IDS.BOUNCED_PAYMENT,
  "bounce \u2013 no response (r01 sequence)":     STAGE_IDS.BOUNCED_PAYMENT,
  "bounce - no response (r01 sequence)":          STAGE_IDS.BOUNCED_PAYMENT,
  "bounce \u2013 no response (r01 sequence) - send legal email": STAGE_IDS.BOUNCED_PAYMENT,
  "bounce - no response (r01 sequence) - send legal email": STAGE_IDS.BOUNCED_PAYMENT,
  "at collections - payment plan":                STAGE_IDS.BOUNCED_PAYMENT,
  "at collections":                               STAGE_IDS.BOUNCED_PAYMENT,
  "collections - in que to be sent":              STAGE_IDS.BOUNCED_PAYMENT,
  "collections - in queue to be sent":            STAGE_IDS.BOUNCED_PAYMENT,
  "settlement negotiation \u2013 pending terms":  STAGE_IDS.BOUNCED_PAYMENT,
  "settlement negotiation - pending terms":       STAGE_IDS.BOUNCED_PAYMENT,
  "settlement offer sent \u2013 awaiting response": STAGE_IDS.BOUNCED_PAYMENT,
  "settlement offer sent - awaiting response":    STAGE_IDS.BOUNCED_PAYMENT,
  "settlement plan \u2013 not performing":        STAGE_IDS.BOUNCED_PAYMENT,
  "settlement plan - not performing":             STAGE_IDS.BOUNCED_PAYMENT,
  "ach revoked \u2013 no contact":                STAGE_IDS.BOUNCED_PAYMENT,
  "ach revoked - no contact":                     STAGE_IDS.BOUNCED_PAYMENT,
  "ach revoked \u2013 in communication/negotiating": STAGE_IDS.BOUNCED_PAYMENT,
  "ach revoked - in communication/negotiating":   STAGE_IDS.BOUNCED_PAYMENT,

  // ── Closed / Lost
  "closed":                                       STAGE_IDS.CLOSED_LOST,
  "closed/lost":                                  STAGE_IDS.CLOSED_LOST,
  "closed lost":                                  STAGE_IDS.CLOSED_LOST,
  "declined":                                     STAGE_IDS.CLOSED_LOST,
  "lost":                                         STAGE_IDS.CLOSED_LOST,
  "written off \u2013 no recovery expected":      STAGE_IDS.CLOSED_LOST,
  "written off - no recovery expected":           STAGE_IDS.CLOSED_LOST,
  "completed \u2013 paid in full":                STAGE_IDS.CLOSED_LOST,
  "completed - paid in full":                     STAGE_IDS.CLOSED_LOST,
  "completed \u2013 early pay discount":          STAGE_IDS.CLOSED_LOST,
  "completed - early pay discount":               STAGE_IDS.CLOSED_LOST,
  "completed - settled for less than owed":       STAGE_IDS.CLOSED_LOST,
  "completed \u2013 settled for less than owed":  STAGE_IDS.CLOSED_LOST,
};

// ─── Helpers ─────────────────────────────────────────────────────────────────
function getHubSpotStage(lendsaasStatus) {
  if (!lendsaasStatus) return null;
  const key = lendsaasStatus.toLowerCase().trim();
  return STAGE_MAP[key] || null;
}

async function hubspotRequest(method, path, body = null) {
  const options = {
    method,
    headers: {
      Authorization: `Bearer ${HUBSPOT_ACCESS_TOKEN}`,
      "Content-Type": "application/json",
    },
  };
  if (body) options.body = JSON.stringify(body);

  const res = await fetch(`${HUBSPOT_BASE_URL}${path}`, options);
  const data = await res.json();

  if (!res.ok) {
    throw new Error(`HubSpot API error ${res.status}: ${JSON.stringify(data)}`);
  }
  return data;
}

async function findDealByLendSaasId(lendsaasDealId) {
  const body = {
    filterGroups: [{
      filters: [{
        propertyName: "lendsaas_deal_id",
        operator: "EQ",
        value: String(lendsaasDealId),
      }],
    }],
    properties: ["dealname", "dealstage", "lendsaas_deal_id"],
    limit: 1,
  };
  const data = await hubspotRequest("POST", "/crm/v3/objects/deals/search", body);
  return data.results && data.results.length > 0 ? data.results[0] : null;
}

async function createDeal(payload, stageId) {
  const properties = {
    dealname: payload.entityName || `LendSaaS Deal ${payload.dealId}`,
    dealstage: stageId,
    pipeline: HUBSPOT_PIPELINE_ID,
    lendsaas_deal_id: String(payload.dealId || ""),
    submission_id: String(payload.submissionId || ""),
  };
  if (payload.loanAmount) properties.amount = String(payload.loanAmount);
  return hubspotRequest("POST", "/crm/v3/objects/deals", { properties });
}

async function updateDeal(hubspotDealId, stageId, payload) {
  const properties = { dealstage: stageId };
  if (payload.submissionId) properties.submission_id = String(payload.submissionId);
  if (payload.entityName) properties.dealname = payload.entityName;
  return hubspotRequest("PATCH", `/crm/v3/objects/deals/${hubspotDealId}`, { properties });
}

// ─── Main Handler ─────────────────────────────────────────────────────────────
export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }
  if (!HUBSPOT_ACCESS_TOKEN) {
    return res.status(500).json({ error: "Server misconfiguration" });
  }

  const payload = req.body;
  console.log("Received LendSaaS webhook:", JSON.stringify(payload));

  const { new_status, dealId } = payload;
  const statusToMap = new_status || "new lead";
  const hubspotStageId = getHubSpotStage(statusToMap);

  if (!hubspotStageId) {
    console.warn(`No HubSpot stage mapping for status: "${new_status}"`);
    return res.status(200).json({
      success: false,
      message: `No stage mapping found for status: "${new_status}"`,
    });
  }

  try {
    const existingDeal = dealId ? await findDealByLendSaasId(dealId) : null;
    let result, action;

    if (existingDeal) {
      result = await updateDeal(existingDeal.id, hubspotStageId, payload);
      action = "updated";
      console.log(`Updated HubSpot deal ${existingDeal.id} → stage: ${hubspotStageId}`);
    } else {
      result = await createDeal(payload, hubspotStageId);
      action = "created";
      console.log(`Created HubSpot deal ${result.id} → stage: ${hubspotStageId}`);
    }

    return res.status(200).json({ success: true, action, hubspotDealId: result.id, stage: hubspotStageId });
  } catch (err) {
    console.error("Error syncing to HubSpot:", err.message);
    return res.status(500).json({ error: err.message });
  }
}
