const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

// Haversine distance in meters
function getDistance(lat1, lon1, lat2, lon2) {
  const R = 6371e3; // metres
  const phi1 = lat1 * Math.PI/180;
  const phi2 = lat2 * Math.PI/180;
  const deltaPhi = (lat2-lat1) * Math.PI/180;
  const deltaLambda = (lon2-lon1) * Math.PI/180;

  const a = Math.sin(deltaPhi/2) * Math.sin(deltaPhi/2) +
            Math.cos(phi1) * Math.cos(phi2) *
            Math.sin(deltaLambda/2) * Math.sin(deltaLambda/2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));

  return R * c; // in meters
}

async function main() {
  const reqs = await prisma.serviceRequest.findMany({
    include: { category: true, location: true }
  });
  
  const johnLat = 12.9627545;
  const johnLng = 80.2515114;

  console.log('--- Service Requests locations and distances to John ---');
  for (const r of reqs) {
    // Let's query coordinates for this address
    const coords = await prisma.$queryRaw`
      SELECT ST_X(coordinates::geometry) as lng, ST_Y(coordinates::geometry) as lat 
      FROM "Address" 
      WHERE id = ${r.locationId}
    `;
    if (coords && coords.length > 0) {
      const lat = coords[0].lat;
      const lng = coords[0].lng;
      const dist = getDistance(johnLat, johnLng, lat, lng);
      console.log({
        id: r.id,
        category: r.category.name,
        status: r.status,
        customerLat: lat,
        customerLng: lng,
        distanceToJohnMeters: dist,
        isWithin5km: dist <= 5000
      });
    } else {
      console.log(`ReqID: ${r.id} has no coords.`);
    }
  }
  process.exit(0);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
