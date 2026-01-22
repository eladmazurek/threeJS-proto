import * as satellite from "satellite.js";

// Constants
const EARTH_RADIUS = 2.0;
const DEG_TO_RAD = Math.PI / 180;
const RAD_TO_DEG = 180 / Math.PI;

interface SatData {
  satrec: satellite.SatRec;
  inclination: number; // degrees
  satnum: string; // for correlation
}

let satellites: SatData[] = [];

self.onmessage = (e: MessageEvent) => {
  const { type, data } = e.data;

  if (type === 'init') {
    // data is array of { line1, line2, satnum }
    satellites = data.map((item: any) => {
      const satrec = satellite.twoline2satrec(item.line1, item.line2);
      const inclinationDeg = (satrec.inclo * 180) / Math.PI;
      return {
        satrec,
        inclination: inclinationDeg,
        satnum: item.satnum
      };
    });
    console.log(`[SatWorker] Initialized ${satellites.length} satellites`);
  } 
  else if (type === 'propagate') {
    const { time } = data;
    const date = new Date(time);
    const gmst = satellite.gstime(date);
    
    // Output buffer: [lat, lon, alt, heading, ascendingNode, ...repeat]
    // 5 floats per satellite
    const buffer = new Float32Array(satellites.length * 5);
    
    for (let i = 0; i < satellites.length; i++) {
      const sat = satellites[i];
      const positionAndVelocity = satellite.propagate(sat.satrec, date);
      
      if (positionAndVelocity.position && typeof positionAndVelocity.position !== 'boolean') {
        const positionEci = positionAndVelocity.position;
        const velocityEci = positionAndVelocity.velocity as satellite.Eci;
        
        // Geodetic
        const geodetic = satellite.eciToGeodetic(positionEci, gmst);
        const lat = (geodetic.latitude * 180) / Math.PI;
        const lon = (geodetic.longitude * 180) / Math.PI;
        // Convert km altitude to scene units
        const alt = (geodetic.height / 6371) * EARTH_RADIUS;
        
        // Calculate heading by propagating a small step forward (1 second)
        // This gives us the ground track direction
        const futureDate = new Date(time + 1000);
        const futureGmst = satellite.gstime(futureDate);
        const futurePosVel = satellite.propagate(sat.satrec, futureDate);
        let heading = 0;
        
        if (futurePosVel.position && typeof futurePosVel.position !== 'boolean') {
           const futureGeo = satellite.eciToGeodetic(futurePosVel.position, futureGmst);
           const lat1 = geodetic.latitude;
           const lon1 = geodetic.longitude;
           const lat2 = futureGeo.latitude;
           const lon2 = futureGeo.longitude;
           
           // Calculate bearing
           const y = Math.sin(lon2 - lon1) * Math.cos(lat2);
           const x = Math.cos(lat1) * Math.sin(lat2) -
                     Math.sin(lat1) * Math.cos(lat2) * Math.cos(lon2 - lon1);
           heading = Math.atan2(y, x) * RAD_TO_DEG;
           if (heading < 0) heading += 360;
        }

        // Ascending Node (Visual alignment)
        // SGP4 gives us Inclination (sat.inclination) and we have Lat.
        // We can reverse engineer LAN.
        
        // Convert Geodetic Latitude to Geocentric Latitude
        const latGeodeticRad = geodetic.latitude;
        const latGeocentricRad = Math.atan(0.9933056 * Math.tan(latGeodeticRad));
        const inclRad = sat.inclination * DEG_TO_RAD;
        
        const sinPhase = Math.max(-1, Math.min(1, Math.sin(latGeocentricRad) / Math.sin(inclRad)));
        let phaseRad = Math.asin(sinPhase);
        
        if (velocityEci.z < 0) {
            phaseRad = Math.PI - phaseRad;
        }
        
        const yOrbit = Math.sin(phaseRad);
        const xOrbit = Math.cos(phaseRad);
        const lonInOrbitRad = Math.atan2(yOrbit * Math.cos(inclRad), xOrbit);
        const lonInOrbitDeg = lonInOrbitRad * RAD_TO_DEG;
        
        let lan = lon - lonInOrbitDeg;
        while (lan > 180) lan -= 360;
        while (lan < -180) lan += 360;

        const offset = i * 5;
        buffer[offset] = lat;
        buffer[offset + 1] = lon;
        buffer[offset + 2] = alt;
        buffer[offset + 3] = heading;
        buffer[offset + 4] = lan;
      }
    }
    
    // Transfer buffer back to main thread
    // @ts-ignore - TS definitions for Worker postMessage transferables can be finicky
    self.postMessage({ type: 'update', buffer }, [buffer.buffer]);
  }
};
