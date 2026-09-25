import {
  canAssignRole,
  getAllowance,
  hasPermission,
  listInvitations,
  listMembers,
  listStores,
  MEMBER_ROLES,
  ROLE_LABELS,
} from "@storevia/tenancy";
import { rolePresetsFor } from "@storevia/tenancy/business-types";
import {
  Alert,
  Badge,
  Card,
  CardBody,
  CardHeader,
  Icon,
  Illustration,
  UsageMeter,
} from "@storevia/ui";
import { Info } from "lucide-react";
import type { Metadata } from "next";
import { AccessNotice } from "@/components/areas/access-notice";
import { PageHeader } from "@/components/shell/app-shell";
import { expiryText, formatShortDate } from "@/lib/areas/dates";
import { storeAccessLabel } from "@/lib/areas/members";
import { relativeTime } from "@/lib/dashboard/activity";
import { invitationPublicId, membershipPublicId } from "@/lib/ids";
import { organisationContextOr404 } from "@/lib/tenant";
import { InvitationRow, InviteForm, MembersList } from "./member-forms";

export const metadata: Metadata = { title: "Members" };

export default async function MembersPage({
  params,
  searchParams,
}: {
  params: Promise<{ orgId: string }>;
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const { orgId } = await params;
  const removed = (await searchParams)["removed"] === "1";
  const ctx = await organisationContextOr404(orgId, `/o/${orgId}/members`);
  if (!hasPermission(ctx, "member.read")) {
    return (
      <>
        <PageHeader eyebrow={ctx.organisationName} title="Members" />
        <AccessNotice title="You don't have access to the member list" illustration="empty-team">
          Ask an owner or admin of {ctx.organisationName} if you need it.
        </AccessNotice>
      </>
    );
  }
  const canManage = hasPermission(ctx, "member.manage");
  const [members, invitations, stores] = await Promise.all([
    listMembers(ctx),
    listInvitations(ctx),
    listStores(ctx),
  ]);
  // Least privilege last and as the default: Viewer.
  const assignableRoles = [...MEMBER_ROLES.filter((role) => role !== "VIEWER"), "VIEWER" as const]
    .filter((role) => canAssignRole(ctx.role, role))
    .map((role) => ({
      value: role,
      label: ROLE_LABELS[role],
    }));
  // Suggestions from the organisation's store types (ADR-0024); each maps to a
  // role the inviter may assign. The server re-checks the role on submit.
  const presets = rolePresetsFor(stores.map((s) => s.businessType))
    .filter((p) => canAssignRole(ctx.role, p.role))
    .map((p) => ({ role: p.role, label: p.label, description: p.description }));
  const canTransfer = hasPermission(ctx, "ownership.transfer");
  const seats = canManage ? await getAllowance(ctx, "staff_accounts") : null;
  const pending = invitations.length;
  const suspended = members.filter((m) => m.status === "SUSPENDED").length;
  const storeNames = new Map(stores.map((s) => [s.id, s.name]));
  const now = new Date();

  return (
    <>
      <PageHeader
        eyebrow={ctx.organisationName}
        title="Members"
        description={`People who can work in ${ctx.organisationName}, and what each of them can do.`}
      />
      <div className="space-y-6 lg:space-y-8">
        {removed ? <Alert tone="success">Member removed.</Alert> : null}

        {canManage ? (
          <Card id="invite" className="scroll-mt-24">
            <CardHeader
              title="Invite someone"
              description="They'll get an email with a link to join. Invitations expire after 7 days."
              actions={
                seats ? (
                  <UsageMeter
                    data-testid="seat-usage"
                    size="sm"
                    label="Seats"
                    used={Number(seats.usage)}
                    limit={seats.limit === "unlimited" ? "unlimited" : Number(seats.limit)}
                    hint={pending > 0 ? `${String(pending)} pending` : undefined}
                    className="w-full sm:w-52"
                  />
                ) : null
              }
            />
            <CardBody className="py-6">
              <InviteForm orgId={orgId} roles={assignableRoles} presets={presets} />
            </CardBody>
          </Card>
        ) : null}

        <Card>
          <CardHeader
            title="Team"
            description={[
              `${String(members.length)} ${members.length === 1 ? "person" : "people"}`,
              suspended > 0 ? `${String(suspended)} suspended` : null,
            ]
              .filter(Boolean)
              .join(" · ")}
          />
          <MembersList
            orgId={orgId}
            roles={assignableRoles}
            members={members.map((member) => ({
              id: membershipPublicId(member.membershipId),
              name: member.name,
              email: member.email,
              role: member.role,
              roleLabel: ROLE_LABELS[member.role],
              status: member.status,
              isCurrentUser: member.isCurrentUser,
              access: storeAccessLabel(member.allStores, member.storeIds, storeNames),
              joined: formatShortDate(member.joinedAt),
              canManage:
                canManage &&
                !member.isCurrentUser &&
                member.role !== "OWNER" &&
                canAssignRole(ctx.role, member.role),
              canTransfer: canTransfer && member.role === "ADMIN" && member.status === "ACTIVE",
            }))}
          />
        </Card>

        <Card>
          <CardHeader
            title="Pending invitations"
            description={
              pending > 0
                ? "Waiting to be accepted. Each link works once, for the address it was sent to."
                : undefined
            }
            actions={pending > 0 ? <Badge variant="dot">{pending} pending</Badge> : undefined}
          />
          {pending === 0 ? (
            <div className="flex items-center gap-4 px-5 py-5 sm:px-6">
              <Illustration name="empty-inbox" size={56} className="shrink-0" />
              <div className="min-w-0">
                <h3 className="text-body-sm font-semibold text-ink">No pending invitations</h3>
                <p className="mt-0.5 text-body-sm text-ink-muted">
                  Invitations you send appear here until they&apos;re accepted or expire.
                </p>
              </div>
            </div>
          ) : (
            <ul className="divide-y divide-line">
              {invitations.map((invitation) => (
                <InvitationRow
                  key={invitation.id}
                  orgId={orgId}
                  invitation={{
                    id: invitationPublicId(invitation.id),
                    email: invitation.email,
                    roleLabel: ROLE_LABELS[invitation.role],
                    sent: relativeTime(invitation.createdAt, now),
                    expires: expiryText(invitation.expiresAt, now),
                  }}
                  canManage={canManage}
                />
              ))}
            </ul>
          )}
        </Card>

        <p className="flex items-start gap-2 text-caption text-ink-faint">
          <Icon icon={Info} size="xs" className="mt-px" />
          Roles decide what each person can see and do. There is one owner, and ownership moves only
          through a transfer.
        </p>
      </div>
    </>
  );
}
