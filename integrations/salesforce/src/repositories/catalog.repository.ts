import {
  Branch,
  BranchRepository,
  Vehicle,
  VehicleRepository,
  VehicleSearchCriteria,
  VehicleVariantRepository,
} from "@tdm/domain";
import { SalesforceConnectionProvider } from "../connection";
import { branchRecordToDomain, variantRecordToDomain, vehicleRecordToDomain, vehicleToUpdateRecord } from "../mappers";
import { BRANCH_FIELDS, VEHICLE_FIELDS, VEHICLE_VARIANT_FIELDS, withConnection } from "../soql";

export class SalesforceVehicleRepository implements VehicleRepository {
  constructor(private readonly connectionProvider: SalesforceConnectionProvider) {}

  async findById(id: string): Promise<Vehicle | null> {
    return withConnection(this.connectionProvider, async (conn) => {
      const result = await conn.query(`SELECT ${VEHICLE_FIELDS} FROM Vehicle__c WHERE Id = '${id}' LIMIT 1`);
      const record = result.records[0];
      return record ? vehicleRecordToDomain(record) : null;
    });
  }

  async search(criteria: VehicleSearchCriteria): Promise<{ items: Vehicle[]; total: number }> {
    return withConnection(this.connectionProvider, async (conn) => {
      const where = this.buildWhereClause(criteria);
      const page = criteria.page ?? 1;
      const pageSize = criteria.pageSize ?? 20;
      const offset = (page - 1) * pageSize;

      const [itemsResult, countResult] = await Promise.all([
        conn.query(
          `SELECT ${VEHICLE_FIELDS} FROM Vehicle__c ${where} ORDER BY Is_Featured__c DESC, CreatedDate DESC ` +
            `LIMIT ${pageSize} OFFSET ${offset}`,
        ),
        conn.query(`SELECT COUNT() FROM Vehicle__c ${where}`),
      ]);

      return {
        items: itemsResult.records.map(vehicleRecordToDomain),
        total: (countResult as any).totalSize,
      };
    });
  }

  async findFeatured(kind: "featured" | "bestSeller" | "newLaunch", limit = 8): Promise<Vehicle[]> {
    const fieldByKind: Record<typeof kind, string> = {
      featured: "Is_Featured__c",
      bestSeller: "Is_Best_Seller__c",
      newLaunch: "Is_New_Launch__c",
    };
    return withConnection(this.connectionProvider, async (conn) => {
      const result = await conn.query(
        `SELECT ${VEHICLE_FIELDS} FROM Vehicle__c WHERE ${fieldByKind[kind]} = true ORDER BY CreatedDate DESC LIMIT ${limit}`,
      );
      return result.records.map(vehicleRecordToDomain);
    });
  }

  async findRelated(vehicleId: string, limit = 4): Promise<Vehicle[]> {
    return withConnection(this.connectionProvider, async (conn) => {
      const current = await conn.query(`SELECT Body_Type__c FROM Vehicle__c WHERE Id = '${vehicleId}' LIMIT 1`);
      const bodyType = (current.records[0] as any)?.Body_Type__c;
      if (!bodyType) return [];
      const result = await conn.query(
        `SELECT ${VEHICLE_FIELDS} FROM Vehicle__c WHERE Body_Type__c = '${escapeSoql(bodyType)}' AND Id != '${vehicleId}' ` +
          `ORDER BY Is_Featured__c DESC LIMIT ${limit}`,
      );
      return result.records.map(vehicleRecordToDomain);
    });
  }

  async save(vehicle: Vehicle): Promise<void> {
    await withConnection(this.connectionProvider, async (conn) => {
      const props = vehicle.toProps();
      await conn.sobject("Vehicle__c").update({ Id: props.id, ...vehicleToUpdateRecord(vehicle) });
    });
  }

  private buildWhereClause(criteria: VehicleSearchCriteria): string {
    const clauses: string[] = [];
    if (criteria.q) {
      const q = escapeSoql(criteria.q);
      clauses.push(`(Make__c LIKE '%${q}%' OR Model__c LIKE '%${q}%')`);
    }
    if (criteria.bodyType) clauses.push(`Body_Type__c = '${escapeSoql(criteria.bodyType)}'`);
    if (criteria.fuelType) clauses.push(`Fuel_Type__c = '${escapeSoql(criteria.fuelType)}'`);
    if (criteria.transmission) clauses.push(`Transmission__c = '${escapeSoql(criteria.transmission)}'`);
    if (criteria.branchId) clauses.push(`Branch__c = '${escapeSoql(criteria.branchId)}'`);
    if (criteria.status) clauses.push(`Status__c = '${escapeSoql(criteria.status)}'`);
    if (criteria.minPrice != null) clauses.push(`Price__c >= ${criteria.minPrice}`);
    if (criteria.maxPrice != null) clauses.push(`Price__c <= ${criteria.maxPrice}`);
    return clauses.length ? `WHERE ${clauses.join(" AND ")}` : "";
  }
}

export class SalesforceBranchRepository implements BranchRepository {
  constructor(private readonly connectionProvider: SalesforceConnectionProvider) {}

  async findById(id: string): Promise<Branch | null> {
    return withConnection(this.connectionProvider, async (conn) => {
      const result = await conn.query(`SELECT ${BRANCH_FIELDS} FROM Branch__c WHERE Id = '${id}' LIMIT 1`);
      const record = result.records[0];
      return record ? branchRecordToDomain(record) : null;
    });
  }

  async findAll(): Promise<Branch[]> {
    return withConnection(this.connectionProvider, async (conn) => {
      const result = await conn.query(`SELECT ${BRANCH_FIELDS} FROM Branch__c WHERE Is_Active__c = true ORDER BY Name`);
      return result.records.map(branchRecordToDomain);
    });
  }
}

export class SalesforceVehicleVariantRepository implements VehicleVariantRepository {
  constructor(private readonly connectionProvider: SalesforceConnectionProvider) {}

  async findByVehicle(vehicleId: string) {
    return withConnection(this.connectionProvider, async (conn) => {
      const result = await conn.query(
        `SELECT ${VEHICLE_VARIANT_FIELDS} FROM Vehicle_Variant__c WHERE Vehicle__c = '${vehicleId}' ORDER BY Display_Order__c ASC`,
      );
      return result.records.map(variantRecordToDomain);
    });
  }

  async findById(id: string) {
    return withConnection(this.connectionProvider, async (conn) => {
      const result = await conn.query(`SELECT ${VEHICLE_VARIANT_FIELDS} FROM Vehicle_Variant__c WHERE Id = '${id}' LIMIT 1`);
      const record = result.records[0];
      return record ? variantRecordToDomain(record) : null;
    });
  }
}

function escapeSoql(value: string): string {
  return value.replace(/'/g, "\\'");
}
