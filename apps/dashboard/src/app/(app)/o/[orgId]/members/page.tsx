import {
  canAssignRole,
  hasPermission,
  listInvitations,
  listMembers,
  MEMBER_ROLES,
  ROLE_LABELS,
} from "@storevia/tenancy";
import { Alert, Badge, Card, CardHeader } from "@storevia/ui";
import type { Metadata } from "next";
import { PageHeader } from "@/components/shell/app-shell";
import { invitationPublicId, membershipPublicId } from "@/lib/ids";
import { organisationContextOr404 } from "@/lib/tenant";
import { InviteForm, InvitationRow, MemberRow } from "./member-forms";

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
        <PageHeader title="Members" />
        <Alert tone="warning" title="You don't have access to the member list">
          Ask an owner or admin of {ctx.organisationName} if you need it.
        </Alert>
      </>
    );
  }
  const canManage = hasPermission(ctx, "member.manage");
  const [members, invitations] = await Promise.all([listMembers(ctx), listInvitations(ctx)]);
  const assignableRoles = MEMBER_ROLES.filter((role) => canAssignRole(ctx.role, role)).map(
    (role) => ({
      value: role,
      label: ROLE_LABELS[role],
    }),
  );
  const canTransfer = hasPermission(ctx, "ownership.transfer");
  return (
    <>
      <PageHeader title="Members" description={`People who can work in ${ctx.organisationName}.`} />
      <div className="space-y-6">
        {removed ? <Alert tone="success">Member removed.</Alert> : null}
        {canManage ? (
          <Card>
            <CardHeader
              title="Invite someone"
              description="They'll get an email with a link to join. Invitations expire after 7 days."
            />
            <div className="px-5 py-4">
              <InviteForm orgId={orgId} roles={assignableRoles} />
            </div>
          </Card>
        ) : null}
        <Card>
          <CardHeader
            title="Members"
            description={`${String(members.length)} ${members.length === 1 ? "person" : "people"}`}
          />
          <ul className="divide-y divide-line">
            {members.map((member) => (
              <MemberRow
                key={member.membershipId}
                orgId={orgId}
                member={{
                  id: membershipPublicId(member.membershipId),
                  name: member.name,
                  email: member.email,
                  role: member.role,
                  roleLabel: ROLE_LABELS[member.role],
                  status: member.status,
                  isCurrentUser: member.isCurrentUser,
                  storeScoped: !member.allStores,
                }}
                roles={assignableRoles}
                canManage={
                  canManage &&
                  !member.isCurrentUser &&
                  member.role !== "OWNER" &&
                  canAssignRole(ctx.role, member.role)
                }
                canTransfer={canTransfer && member.role === "ADMIN" && member.status === "ACTIVE"}
              />
            ))}
          </ul>
        </Card>
        <Card>
          <CardHeader title="Pending invitations" />
          {invitations.length === 0 ? (
            <p className="px-5 py-6 text-sm text-ink-muted">No pending invitations.</p>
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
                    expires: invitation.expiresAt.toISOString(),
                  }}
                  canManage={canManage}
                />
              ))}
            </ul>
          )}
        </Card>
        <p className="text-xs text-ink-faint">
          Roles control what each person can see and do. <Badge>Owner</Badge> is unique and moves
          only through an ownership transfer.
        </p>
      </div>
    </>
  );
}
