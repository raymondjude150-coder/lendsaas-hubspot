// LendSaaS → HubSpot Middleware
// Deployed on Vercel as a serverless function

const HUBSPOT_ACCESS_TOKEN = process.env.HUBSPOT_ACCESS_TOKEN;
const HUBSPOT_PIPELINE_ID = process.env.HUBSPOT_PIPELINE_ID || "default";
const HUBSPOT_BASE_URL = "https://api.hubapi.com";

// ─── Stage Mapping ───────────────────────────────────────────────────────────
// Maps LendSaaS new_status values → HubSpot deal stage IDs
// NOTE: Replace these stage ID values with your actual HubSpot pipeline stage IDs.
// To find them: HubSpot → Settings → CRM → Deals → Pipelines → click your pipeline
const STAGE_MAP = {
  // LendSaaS status (lowercase)  →  HubSpot stage ID
  "new":                            "appointmentscheduled",   // New Application
  "new lead":                       "appointmentscheduled",
  "lead created":                   "appointmentscheduled",
  "under review":                   "qualifiedtobuy",         // Under Review
  "in review":                      "qualifiedtobuy",
  "review":                         "qualifiedtobuy",
  "approved":                       "presentationscheduled",  // Approved
  "funded":                         "closedwon",              // Funded
  "bounced payment":                "decisionmakerboughtin",  // Bounced Payment
  "bounced":                        "decisionmakerboughtin",
  "closed":                         "closedlost",             // Closed/Lost
  "closed/lost":                    "closedlost",
  "declined":                       "closedlost",
  "lost":                           "closedlost",
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
    throw new Error(
      `HubSpot API error ${res.status}: ${JSON.stringify(data)}`
    );
  }
  return data;
}

// Search HubSpot for a deal by LendSaaS Deal ID (stored in custom property)
async function findDealByLendSaasId(lendsaasDealId) {
  const body = {
    filterGroups: [
      {
        filters: [
          {
            propertyName: "lendsaas_deal_id", // your custom HubSpot property internal name
            operator: "EQ",
            value: String(lendsaasDealId),
          },
        ],
      },
    ],
    properties: ["dealname", "dealstage", "lendsaas_deal_id"],
    limit: 1,
  };

  const data = await hubspotRequest(
    "POST",
    "/crm/v3/objects/deals/search",
    body
  );
  return data.results && data.results.length > 0 ? data.results[0] : null;
}

// Create a new deal in HubSpot
async function createDeal(payload, stageId) {
  const properties = {
    dealname: payload.entityName || `LendSaaS Deal ${payload.dealId}`,
    dealstage: stageId,
    pipeline: HUBSPOT_PIPELINE_ID,
    lendsaas_deal_id: String(payload.dealId || ""),
    submission_id: String(payload.submissionId || ""),
  };

  // Optionally set loan amount if provided
  if (payload.loanAmount) {
    properties.amount = String(payload.loanAmount);
  }

  return hubspotRequest("POST", "/crm/v3/objects/deals", { properties });
}

// Update an existing deal's stage in HubSpot
async function updateDeal(hubspotDealId, stageId, payload) {
  const properties = { dealstage: stageId };

  if (payload.submissionId) {
    properties.submission_id = String(payload.submissionId);
  }
  if (payload.entityName) {
    properties.dealname = payload.entityName;
  }

  return hubspotRequest(
    "PATCH",
    `/crm/v3/objects/deals/${hubspotDealId}`,
    { properties }
  );
}

// ─── Main Handler ─────────────────────────────────────────────────────────────
export default async function handler(req, res) {
  // Only accept POST
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  // Validate token is configured
  if (!HUBSPOT_ACCESS_TOKEN) {
    console.error("HUBSPOT_ACCESS_TOKEN environment variable is not set");
    return res.status(500).json({ error: "Server misconfiguration" });
  }

  const payload = req.body;
  console.log("Received LendSaaS webhook:", JSON.stringify(payload));

  const { uuid, timestamp, new_status, new_status_id, dealId, entityName, submissionId } = payload;

  // ── Handle lead.created with no status → default to "New Application"
  const statusToMap = new_status || "new lead";
  const hubspotStageId = getHubSpotStage(statusToMap);

  if (!hubspotStageId) {
    console.warn(`No HubSpot stage mapping for status: "${new_status}"`);
    // Still return 200 so LendSaaS doesn't retry — just log and skip
    return res.status(200).json({
      success: false,
      message: `No stage mapping found for status: "${new_status}"`,
    });
  }

  try {
    // Check if deal already exists
    const existingDeal = dealId ? await findDealByLendSaasId(dealId) : null;

    let result;
    let action;

    if (existingDeal) {
      // UPDATE existing deal
      result = await updateDeal(existingDeal.id, hubspotStageId, payload);
      action = "updated";
      console.log(`Updated HubSpot deal ${existingDeal.id} → stage: ${hubspotStageId}`);
    } else {
      // CREATE new deal
      result = await createDeal(payload, hubspotStageId);
      action = "created";
      console.log(`Created HubSpot deal ${result.id} → stage: ${hubspotStageId}`);
    }

    return res.status(200).json({
      success: true,
      action,
      hubspotDealId: result.id,
      stage: hubspotStageId,
    });
  } catch (err) {
    console.error("Error syncing to HubSpot:", err.message);
    return res.status(500).json({ error: err.message });
  }
}
