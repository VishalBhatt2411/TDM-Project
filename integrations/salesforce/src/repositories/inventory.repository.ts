import {
  UNASSIGNED_ID,
  VehicleAllocation,
  VehicleAllocationFilter,
  VehicleAllocationRepository,
  WishlistItem,
  WishlistRepository,
} from "@tdm/domain";
import { SalesforceConnectionSource } from "../connection-source";
import { allocationRecordToDomain, allocationToRecord, wishlistRecordToDomain } from "../mappers";
import { dealershipCondition, escapeSoql, resolveContactId, withConnection } from "../soql";

export class SalesforceWishlistRepository implements WishlistRepository {
  constructor(private readonly connectionProvider: SalesforceConnectionSource) {}

  async findByCustomer(customerId: string): Promise<WishlistItem[]> {
    return withConnection(this.connectionProvider, async (conn) => {
      const contactId = await resolveContactId(conn, customerId);
      if (!contactId) return [];
      const result = await conn.query(
        `SELECT Id, Contact__c, Vehicle__c, CreatedDate FROM Wishlist_Item__c WHERE Contact__c = '${escapeSoql(contactId)}'`,
      );
      return result.records.map(wishlistRecordToDomain);
    });
  }

  async add(item: WishlistItem): Promise<void> {
    await withConnection(this.connectionProvider, async (conn) => {
      const props = item.toProps();
      const contactId = await resolveContactId(conn, props.customerId);
      if (!contactId) throw new Error(`No Salesforce Contact found for platform customer id ${props.customerId}.`);
      await conn.sobject("Wishlist_Item__c").create({ Contact__c: contactId, Vehicle__c: props.vehicleId });
    });
  }

  async remove(customerId: string, vehicleId: string): Promise<void> {
    await withConnection(this.connectionProvider, async (conn) => {
      const contactId = await resolveContactId(conn, customerId);
      if (!contactId) return;
      const result = await conn.query(
        `SELECT Id FROM Wishlist_Item__c WHERE Contact__c = '${escapeSoql(contactId)}' AND Vehicle__c = '${escapeSoql(vehicleId)}'`,
      );
      for (const record of result.records as any[]) {
        await conn.sobject("Wishlist_Item__c").destroy(record.Id);
      }
    });
  }
}

const ALLOCATION_FIELDS = "Id, Vehicle__c, From_Branch__c, To_Branch__c, Transfer_Date__c, Status__c";

export class SalesforceVehicleAllocationRepository implements VehicleAllocationRepository {
  constructor(private readonly connectionProvider: SalesforceConnectionSource) {}

  async save(allocation: VehicleAllocation): Promise<VehicleAllocation> {
    return withConnection(this.connectionProvider, async (conn) => {
      const props = allocation.toProps();
      const record = allocationToRecord(allocation);
      if (props.id === UNASSIGNED_ID) {
        const created = await conn.sobject("Vehicle_Allocation__c").create(record);
        if (!(created as any).success) {
          throw new Error(`Failed to create Vehicle_Allocation__c: ${JSON.stringify((created as any).errors)}`);
        }
        return VehicleAllocation.restore({ ...props, id: (created as any).id });
      }
      const updated = await conn.sobject("Vehicle_Allocation__c").update({ Id: props.id, ...record });
      if (!(updated as any).success) {
        throw new Error(`Failed to update Vehicle_Allocation__c ${props.id}: ${JSON.stringify((updated as any).errors)}`);
      }
      return allocation;
    });
  }

  async findById(id: string): Promise<VehicleAllocation | null> {
    return withConnection(this.connectionProvider, async (conn) => {
      const result = await conn.query(
        `SELECT ${ALLOCATION_FIELDS} FROM Vehicle_Allocation__c WHERE Id = '${escapeSoql(id)}' LIMIT 1`,
      );
      const record = result.records[0];
      return record ? allocationRecordToDomain(record) : null;
    });
  }

  async findAll(filter?: VehicleAllocationFilter): Promise<VehicleAllocation[]> {
    return withConnection(this.connectionProvider, async (conn) => {
      const from = dealershipCondition("From_Branch__r.Dealership__c", filter?.dealershipIds);
      const to = dealershipCondition("To_Branch__r.Dealership__c", filter?.dealershipIds);
      const conditions = [
        filter?.status ? `Status__c = '${escapeSoql(filter.status)}'` : null,
        from && to ? `(${from} OR ${to})` : null,
      ].filter(Boolean);
      const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";
      const result = await conn.query(
        `SELECT ${ALLOCATION_FIELDS} FROM Vehicle_Allocation__c ${where} ORDER BY CreatedDate DESC LIMIT 200`,
      );
      return result.records.map(allocationRecordToDomain);
    });
  }
}
