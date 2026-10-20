# Third-party notices

The root MIT license covers Photo Atlas's own source code. It does not relicense the following data, dependencies, services or users' uploaded works.

## GeoNames geographical data — CC BY 4.0

`backend/app/data/cities15000.json.gz` is a JSON conversion of the GeoNames cities15000 dataset, with the city identifiers, names, aliases, country codes, coordinates and population fields used by offline place matching. Changes: selected fields, JSON serialization and gzip compression. The data is not a database of photographs or user visits.

- Source: https://download.geonames.org/export/dump/
- Attribution: GeoNames, https://www.geonames.org/
- Terms: https://www.geonames.org/about.html
- License: Creative Commons Attribution 4.0 International, https://creativecommons.org/licenses/by/4.0/

Keep this attribution and the applicable data license when redistributing this file. Photo Atlas's API and map UI retain GeoNames attribution.

## Web map

The web client uses MapLibre GL JS installed through npm and the OpenFreeMap public style. MapLibre retains its upstream license in its npm package. Map labels and tile data retain the provider's attribution (OpenFreeMap, OpenMapTiles and OpenStreetMap). Do not remove the map attribution control.

- MapLibre: https://github.com/maplibre/maplibre-gl-js
- OpenFreeMap: https://openfreemap.org/quick_start/
- OpenStreetMap copyright: https://www.openstreetmap.org/copyright

Mini-program place reference links identify their source in the UI; they do not bundle third-party photographs or map tiles.

## Dependencies

JavaScript and Python dependencies, including binary libvips components, keep their own upstream licenses. Installing packages does not transfer those works to the root MIT license. Dependency and binary redistribution requires preserving their applicable notices. Build output and installed dependencies are not included in the source archive.

## Images and identity

No personal photography, RAW/XMP files, portfolio caption records or personal branding pack is included. The demo generator draws new geometric illustrations locally. The small map marker is a generic interface asset. Uploaders remain responsible for the rights to their own photographs and content. Use your own site identity and small-program registration.

The open-source edition does not include the React Bits-derived circular renderer. Its featured carousel uses the project's independent implementation.
