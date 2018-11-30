CRAB-import
===========

With the HTML-page 'index.html', data from the AGIV-CRAB-adressenlijst dataset can be imported into JOSM on a per postcode / per street basis. The up-to-date version of the tool is found at http://crab-import.osm.be/

The JSON-files in the data folder are derived from the AGIV-CRAB-adressenlijst dataset using the python import script `extract.py`. So they fall under the Free Open Data License Flanders v1.0.

DATA Update
===========

Updating the data is rather simple, but you have to make sure that all the removed streetnames are actually gone, and that the new streetnames are added.

1. Make sure this git repo is updated (`git pull`)
2. First download the shapefile from https://download.vlaanderen.be/Producten/Detail?id=447&title=CRAB_Adressenlijst
   try:
  ```
  wget https://downloadagiv.blob.core.windows.net/crab-adressenlijst/Shapefile/CRAB_Adressenlijst_Shapefile.zip
  ```
3. Extract the zip on your computer, you need the entire Shapefile directory together (so not only the .shp file).
4. Delete the `data` directory (`rm -r data`) to remove the old streets
5. Run the extract script with Python 2 (either called python or python2 depending on your system).
  ```
  python2 extract.py ../path/to/Shapefile/CrabAdr.shp
  ```
6. Add the new streets to git (`git add --all data/*`). If you forget this step, places where new streets are created won't load anymore.
7. Update the extraction date in the `import.html` file
8. Commit the changes (`git commit -a -m "Updated data to yyyy-mm-dd"`)
9. Push the changes to the online repo (`git push origin master`)
