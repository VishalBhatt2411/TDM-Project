import { IsRecordId } from "../common/record-id";

export class AddWishlistItemDto {
  @IsRecordId()
  vehicleId!: string;
}
