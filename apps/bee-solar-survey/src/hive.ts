import { assessCompleteness, toDesignSuitePayload } from './schema'
import type { HiveJob, SiteSurveyProject, SurveyPhoto } from './types'

function isoNow(): string {
  return new Date().toISOString()
}

/** Collect loop: field survey → work-ledger job (Trust L1, never customer outbound) */
export function buildCollectSiteSurveyJob(
  project: SiteSurveyProject,
  photos: SurveyPhoto[],
): HiveJob {
  const completeness = assessCompleteness(project, photos)
  return {
    id: crypto.randomUUID(),
    kind: 'collect',
    loop: 'collect.site-survey',
    status: completeness.readyForWave54 ? 'succeeded' : 'queued',
    trustTier: 'L1',
    costTier: 0,
    source: 'bee-solar-survey',
    payload: {
      projectId: project.id,
      projectName: project.projectName,
      surveyDate: project.surveyDate,
      surveyor: project.surveyor,
      photoCount: photos.length,
      completeness,
      raw: project,
      photoMeta: photos.map((p) => ({
        id: p.id,
        field: p.field,
        mimeType: p.mimeType,
        sha256: p.sha256 ?? null,
        annotated: !!p.annotated,
      })),
    },
    result: null,
    error: null,
    createdAt: isoNow(),
    startedAt: isoNow(),
    finishedAt: completeness.readyForWave54 ? isoNow() : null,
    outbound: {
      channel: 'none',
      destinationClass: 'drafts_group',
      requiresHumanPick: true,
    },
  }
}

/** Edit loop: normalize to Wave 54 DesignSuiteReq shape */
export function buildEditNormalizeJob(
  project: SiteSurveyProject,
  photos: SurveyPhoto[],
  collectJobId: string,
): HiveJob {
  const normalized = toDesignSuitePayload(project, photos)
  const completeness = assessCompleteness(project, photos)
  const blocked = !completeness.readyForWave54

  return {
    id: crypto.randomUUID(),
    kind: 'edit',
    loop: 'edit.normalize-site-survey',
    status: blocked ? 'blocked_trust' : 'succeeded',
    trustTier: 'L1',
    costTier: 0,
    source: 'bee-solar-survey',
    payload: {
      collectJobId,
      projectId: project.id,
      designSuiteReq: {
        site: normalized.site,
        target: normalized.target,
        preferences: normalized.preferences,
        // customer.id filled by spine when linked to CRM — §3.6a: do not invent
        customer: { id: '[OPEN]', tier: 'standard' },
      },
      electricalIntake: normalized.electricalIntake,
      completeness,
      notes: project.generalNotes,
      customFields: project.customFields,
    },
    result: blocked
      ? null
      : {
          readyFor: 'wave-54.designSuite',
          artifactHint: 'DesignArtifact.requestHash from normalized site+target',
        },
    error: blocked
      ? `חסרים שדות חובה: ${completeness.missingRequired.join(', ')}`
      : null,
    createdAt: isoNow(),
    startedAt: isoNow(),
    finishedAt: isoNow(),
    outbound: {
      channel: 'db',
      destinationClass: 'drafts_group',
      requiresHumanPick: true,
    },
  }
}

/**
 * Dispatch draft only — Law #2.
 * Never marks destinationClass=customer. Barak picks before any external send.
 */
export function buildDispatchDraftJob(
  project: SiteSurveyProject,
  editJobId: string,
): HiveJob {
  return {
    id: crypto.randomUUID(),
    kind: 'dispatch',
    loop: 'dispatch.draft',
    status: 'queued',
    trustTier: 'L1',
    costTier: 0,
    source: 'bee-solar-survey',
    payload: {
      editJobId,
      projectId: project.id,
      titleHe: `טיוטת סקר אתר — ${project.projectName}`,
      nextAgent: 'wave-54',
      messageHe:
        'סקר אתר מוכן לעיון. לאחר אישור ברק → engineering-agent.designSuite. אין שליחה ללקוח.',
    },
    result: null,
    error: null,
    createdAt: isoNow(),
    outbound: {
      channel: 'whatsapp',
      destinationClass: 'drafts_group',
      requiresHumanPick: true,
    },
  }
}

export interface HiveExportBundle {
  exportedAt: string
  app: 'bee-solar-survey'
  hiveModel: 'Collect → Edit → Dispatch'
  trust: {
    law1: '4 authorized WA destinations only'
    law2: 'Human picks — no customer auto-send'
    tier: 'L1'
  }
  jobs: HiveJob[]
}

export function buildHiveExportBundle(
  project: SiteSurveyProject,
  photos: SurveyPhoto[],
): HiveExportBundle {
  const collect = buildCollectSiteSurveyJob(project, photos)
  const edit = buildEditNormalizeJob(project, photos, collect.id)
  const jobs: HiveJob[] = [collect, edit]
  if (edit.status === 'succeeded') {
    jobs.push(buildDispatchDraftJob(project, edit.id))
  }
  return {
    exportedAt: isoNow(),
    app: 'bee-solar-survey',
    hiveModel: 'Collect → Edit → Dispatch',
    trust: {
      law1: '4 authorized WA destinations only',
      law2: 'Human picks — no customer auto-send',
      tier: 'L1',
    },
    jobs,
  }
}

export function downloadJson(filename: string, data: unknown): void {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}
