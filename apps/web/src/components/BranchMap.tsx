import { MapContainer, Marker, Popup, TileLayer } from "react-leaflet";
import L from "leaflet";
import markerIcon2x from "leaflet/dist/images/marker-icon-2x.png";
import markerIcon from "leaflet/dist/images/marker-icon.png";
import markerShadow from "leaflet/dist/images/marker-shadow.png";
import "leaflet/dist/leaflet.css";
import type { BranchDto } from "@/api/branches";

// Vite bundlers break Leaflet's default marker icon lookup (it expects relative
// URLs resolved against the page, not the bundled asset paths) — re-point it at
// the bundled asset URLs explicitly, once, module-wide.
const defaultIcon = L.icon({
  iconUrl: markerIcon,
  iconRetinaUrl: markerIcon2x,
  shadowUrl: markerShadow,
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
  shadowSize: [41, 41],
});
L.Marker.prototype.options.icon = defaultIcon;

const INDIA_CENTER: [number, number] = [22.9734, 78.6569];

interface BranchMapProps {
  branches: BranchDto[];
  selectedBranchId?: string;
  onSelectBranch?: (branchId: string) => void;
  height?: number;
}

export function BranchMap({ branches, selectedBranchId, onSelectBranch, height = 400 }: BranchMapProps) {
  const geoBranches = branches.filter((b) => b.geo);
  const center: [number, number] =
    geoBranches.length > 0
      ? [
          geoBranches.reduce((sum, b) => sum + b.geo!.latitude, 0) / geoBranches.length,
          geoBranches.reduce((sum, b) => sum + b.geo!.longitude, 0) / geoBranches.length,
        ]
      : INDIA_CENTER;

  if (geoBranches.length === 0) {
    return (
      <div className="flex items-center justify-center rounded-md border bg-muted/40 text-sm text-muted-foreground" style={{ height }}>
        No branch locations are available yet.
      </div>
    );
  }

  return (
    <MapContainer center={center} zoom={geoBranches.length > 1 ? 5 : 12} style={{ height, width: "100%" }} className="rounded-md border">
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />
      {geoBranches.map((branch) => (
        <Marker
          key={branch.id}
          position={[branch.geo!.latitude, branch.geo!.longitude]}
          eventHandlers={onSelectBranch ? { click: () => onSelectBranch(branch.id) } : undefined}
          opacity={!selectedBranchId || selectedBranchId === branch.id ? 1 : 0.6}
        >
          <Popup>
            <p className="font-medium">{branch.name}</p>
            <p className="text-sm">{branch.address.line1}, {branch.address.city}</p>
            {branch.phone && <p className="text-sm">{branch.phone}</p>}
            <a
              href={`https://www.openstreetmap.org/directions?to=${branch.geo!.latitude},${branch.geo!.longitude}`}
              target="_blank"
              rel="noreferrer"
              className="text-sm text-primary underline"
            >
              Get Directions
            </a>
          </Popup>
        </Marker>
      ))}
    </MapContainer>
  );
}
