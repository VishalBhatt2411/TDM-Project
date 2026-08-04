import { VehicleAllocation, VehicleAllocationRepository, WishlistItem, WishlistRepository } from "@tdm/domain";
import { SalesforceConnectionProvider } from "../connection";
import { allocationRecordToDomain, allocationToRecord, wishlistRecordToDomain } from "../mappers";
import { withConnection } from "../soql";

export class SalesforceWishlistRepository implements WishlistRepository {
  constructor(private readonly connectionProvider: SalesforceConnectionProvider) {}

  async findByCustomer(customerId: string): Promise<WishlistItem[]> {
    return withConnection(this.connectionProvider, async (conn) => {
      const contactId = await resolveContactId(conn, customerId);
      if (!contactId) return [];
      const result = await conn.query(
        `SELECT Id, Contact__c, Vehicle__c, CreatedDate FROM Wishlist_Item__c WHERE Contact__c = '${contactId}'`,
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
        `SELECT Id FROM Wishlist_Item__c WHERE Contact__c = '${contactId}' AND Vehicle__c = '${vehicleId}'`,
      );
      for (const record of result.records as any[]) {
        await conn.sobject("Wishlist_Item__c").destroy(record.Id);
      }
    });
  }
}

export class SalesforceVehicleAllocationRepository implements VehicleAllocationRepository {
  constructor(private readonly connectionProvider: SalesforceConnectionProvider) {}

  async save(allocation: VehicleAllocation): Promise<void> {
    await withConnection(this.connectionProvider, async (conn) => {
      const props = allocation.toProps();
      const record = allocationToRecord(allocation);
      const existing = await conn
        .query(`SELECT Id FROM Vehicle_Allocation__c WHERE Id = '${props.id}' LIMIT 1`)
        .catch(() => ({ records: [] as any[], done: true, totalSize: 0 }));
      if (existing.records[0]) {
        await conn.sobject("Vehicle_Allocation__c").update({ Id: props.id, ...record });
      } else {
        await conn.sobject("Vehicle_Allocation__c").create(record);
      }
    });
  }

  async findById(id: string): Promise<VehicleAllocation | null> {
    return withConnection(this.connectionProvider, async (conn) => {
      const result = await conn.query(
        `SELECT Id, Vehicle__c, From_Branch__c, To_Branch__c, Transfer_Date__c, Status__c FROM Vehicle_Allocation__c WHERE Id = '${id}' LIMIT 1`,
      );
      const record = result.records[0];
      return record ? allocationRecordToDomain(record) : null;
    });
  }
}

async function resolveContactId(conn: any, platformCustomerId: string): Promise<string | null> {
  const result = await conn.query(`SELECT Id FROM Contact WHERE Portal_User_Id__c = '${platformCustomerId}' LIMIT 1`);
  return result.records[0]?.Id ?? null;
}
