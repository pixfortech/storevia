import { toTypeId } from "@storevia/types";

export const orgPath = (organisationId: string, suffix = "") =>
  `/o/${toTypeId("organisation", organisationId)}${suffix}`;
export const storePath = (storeId: string, suffix = "") =>
  `/s/${toTypeId("store", storeId)}${suffix}`;
export const membershipPublicId = (membershipId: string) => toTypeId("membership", membershipId);
export const invitationPublicId = (invitationId: string) => toTypeId("invitation", invitationId);
export const storePublicId = (storeId: string) => toTypeId("store", storeId);
