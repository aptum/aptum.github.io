# vim: tabstop=4:softtabstop=4:shiftwidth=4:expandtab

import os 
import io
import sys
import string
import time
import json
import shapefile
from collections import namedtuple

from lambert import Belgium1972LambertProjection

# Statistical variables
stats = {
    'records'        : 0, # the amount of reccords in the source-file
    'municipalities' : 0, # the amount of municipalities in the source-file
    'pcodes'         : 0, # the amount of postcodes in the source-file
    'streets'        : 0, # the amount of streets in the source-file
    'housenumbers'   : 0, # the amount of unique addresses written to output-files
    'busnrs'         : 0, # the amount of recoords with a BUSNR
    'apptnrs'         : 0 # the amount of reccords with a APTNR
}
# Faulty stats (logging the mistakes in CRAB)
f_stats = {
    'strnms'         : 0, # the amount of mismatches between straat-id's and their name
    'strt_pcs'       : 0, # the amount of streets that appear in more than one postcode
    'strt_nis'       : 0, # the amount of streets that appear in more than one municipality
    'PSH_not_unique' : 0, # the amount of Postcode-Streetname-Housenumber addresses with a deviant NIS-code
    'niscodes'       : 0, # the amount of mismatches between niscodes and their minicipality-name
    'postcodes'      : 0, # the amount of mismatches between postcodes an ther municipality (1 postcode belonging to multiple municiplaities)
    'busnrs_apptnrs' : 0 # the amount of addresses with one or more busnrs as well as one or more apptnr
}

error_log = ""

multiple_NIS_per_PC_log =  "ADDR_ID, LAT, LON, HUISNR, STRAAT_ID, STRAATNM, POSTCODE, NISCODE, GEM_NAAM, MATCH_NIS, MATCH_GEM\n"


# Program-configurables
screen_width = 80 # width in char's

# Display progress in 50-char width
global it
it = dict()
def dispProgress(name, start_msg="", i=-1, total=2):
    if (i < 1 and len(start_msg) > 0) :
        it[name] = [0, screen_width - 4 - len(start_msg)]
        sys.stdout.write(start_msg)
    progress = int((i / float(total)) * it[name][1])
    if(progress > it[name][0] + 1):
        for j in range(0, progress - it[name][0]):
            sys.stdout.write('.')
            it[name][0] += 1
    if  ((i == (total - 1) or i == -1) and start_msg == "") :
        for j in range(0, it[name][1] - it[name][0]):
            sys.stdout.write('.')
        sys.stdout.write('Done\n')
    sys.stdout.flush()

# Sanitize strings so they are valid on any platform (only alphanumeric chars allowed)
valid_chars = "%s%s" % (string.ascii_letters, string.digits)
def sanitize(s):
    return ''.join(c for c in s if c in valid_chars).lower()
    

# Watch out for memory usage with dictionaries.
# The overhead is quite high (about 140B), so reduce the amount of dictionaries in total.
# The overhead for the content of the dictionary itself is low, so large dictionaries aren't a problem.
# A large quantity of small dictionaries should be avoilded by using lists or tuples

#Dictionaries
##############

hier_addr_dic = dict() # Address Hierarchy: Postcode -> Street-id -> Housenumber -> (HUISNR, lat, lon, HERKOMST, APPTNR, BUSNR, HNRLABEL)
######################## Data structure:
                       # hier_addr_dic = {POSTCODE : {STRAATNMID : {HUISNR : [addr_tuple]}}}

gem_dic = dict()       # municipalities indexed by their NISCODE
######################## Data structure:
                       # gem_dic =  {NISCODE : (GEMEENTE, [POSTCODE])}

pc_nis_dic = dict()    # NIS-codes indexed by their postcode
######################## Data structure:
                       # pc_nis_dic = {POSTCODE : NISCODE}


strtnm_dic = dict()    # The postalcodes per niscode are registered for each street
######################## Data structure:
                       # strtnm_dic = {STRAATNAAMID : (NISCODE, [POSTCODE])}
                       

#Named Tuples
#############

Address = namedtuple('Address', ['housenumber', 'lat', 'lon', 'source', 'apptnr', 'busnr', 'hnrlabel', 'niscode'])
Street  = namedtuple('Street',  ['original', 'sanitized', 'housenumbers'])


time_at_start = time.time()
dispProgress("m1", "Initialize")
#sf = shapefile.Reader("./Export_Output_kastanjelaan.shp")
sf = shapefile.Reader("../Shapefile/CrabAdr.shp")
#sf = shapefile.Reader("../CRAB_Adressenlijst/Shapefile/CrabAdr.shp")

rec_count = len(sf.shapes())
dispProgress("m1")

projection = Belgium1972LambertProjection()
loopstart = time.time()
for nr in range(0, rec_count):
    dispProgress("proc_rec", "Loading file", nr, rec_count)
    record = sf.shapeRecord(nr).record
    # data-fields in shapefile:
    f_id         = int(record[0])          # ID         adrespunt-id
    f_straatnmid = int(record[1])          # STRAATNMID straatnaam-id
    f_straatnm   = str(record[2]).strip()  # STRAATNM   straatnaam
    f_huisnr     = str(record[3]).strip()  # HUISNR     huisnummer
    f_apptnr     = str(record[4]).strip()  # APPTNR     appartementnummer
    f_busnr      = str(record[5]).strip()  # BUSNR      busnr
    f_hnrlabel   = str(record[6]).strip()  # HNRLABEL   afgeleid: bevat hoogste en laatste nr indien meerdere huisnummers op datzelfde punt vallen
    f_niscode    = str(record[7]).strip()  # NISCODE    NIS-code: http://nl.wikipedia.org/wiki/NIS-code
    f_gemeente   = str(record[8]).strip()  # GEMEENTE   gemeente
    f_postcode   = str(record[9]).strip()  # POSTCODE   postcode
    f_herkomst   = str(record[10]).strip() # HERKOMST   herkomst

    # Conversion Lambert72-coordinates to lat/lon
    coord = sf.shapeRecord(nr).shape.points[0]
    [latitude, longitude] = projection.to_wgs84(coord[0], coord[1])

    # Create the address
    ###########################
    addr = Address(housenumber = f_huisnr,
                   lat         = latitude,
                   lon         = longitude,
                   source      = f_herkomst,
                   apptnr      = f_apptnr,
                   busnr       = f_busnr,
                   hnrlabel    = f_hnrlabel,
                   niscode     = f_niscode)
    stats['records'] += 1

    # Build hierarchical dictionary
    ###############################
    
    # Postal-code
    if (f_postcode not in hier_addr_dic):
        hier_addr_dic[f_postcode] = dict()
        stats['pcodes'] += 1

    # Street
    if (f_straatnmid not in hier_addr_dic[f_postcode]):
        hier_addr_dic[f_postcode][f_straatnmid] = Street(original     = f_straatnm,
                                                         sanitized    = sanitize(f_straatnm),
                                                         housenumbers = dict())
        stats['streets'] += 1
    else :
        # Street-id already present: check if names match
        if(f_straatnm != hier_addr_dic[f_postcode][f_straatnmid].original):
            # The street-id is already present, but the names don't match
            error_log += "For address " + str(f_id) + ": street-id: " + str(f_straatnmid) + " = " + str(f_straatnm) + " doesn't match: " + str(straatnm_dic[f_postcode][f_straatnmid] + " = " + hier_addr_dic[f_postcode][f_straatnmid].original) + "\n"
            f_stats['strnm'] += 1
    # check if straatnaamid corresponds to multiple postcodes/municipalities
    if (f_straatnmid not in strtnm_dic):
        strtnm_dic[f_straatnmid] = (f_niscode, [f_postcode])
    else:
        if(f_postcode not in strtnm_dic[f_straatnmid][1]):
            # multiple postcodes for 1 straatnmid: This can happen...
            # The address is defined for a postcode, but the street continues in another postcode...
            # Optional error-string:
            # error_log += "For address " + str(f_id) + ": straatid: " + str(f_straatnmid) + ": " + str(f_postcode) + " matcht niet met dic: " + str(strtnm_dic[f_straatnmid][0]) + "\n"
            f_stats['strt_pcs'] += 1
            if(f_postcode not in strtnm_dic[f_straatnmid][1]): strtnm_dic[f_straatnmid][1].append(f_postcode)
        if(strtnm_dic[f_straatnmid][0] != f_niscode):
            # multiple NIS-codes for 1 straatnmid: this shouldn't happen
            error_log += "For address " + str(f_id) + ": straatid: " + str(f_straatnmid) + ": " + str(f_niscode) + " matcht niet met dic: " + str(strtnm_dic[f_straatnmid][1]) + "\n"
            f_stats['strt_nis'] += 1

    # Addresses
    if (f_huisnr not in hier_addr_dic[f_postcode][f_straatnmid].housenumbers):
        hier_addr_dic[f_postcode][f_straatnmid].housenumbers[f_huisnr] = []
        stats['housenumbers'] += 1
    else :
        # Check if postcode-street-housenumber already exists, and if so, if nis-code differs
        # This means that there are two addresses fully equal, except for the NIS-code.
        for a in hier_addr_dic[f_postcode][f_straatnmid].housenumbers[f_huisnr]:
            if a.niscode != f_niscode:
                error_log += "For address " + str(f_id) + " niscode=" + str(f_niscode) + "doesn't match the niscode for other addresses with the samen postcode, street and housenumber: " + str(a.niscode)
                f_stats['PSH_not_unique'] += 1

    hier_addr_dic[f_postcode][f_straatnmid].housenumbers[f_huisnr].append(addr)

    if (len(f_apptnr) > 0) : stats['apptnrs'] += 1
    if (len(f_busnr) > 0)  : stats['busnrs'] += 1

    # Municipality
    # Build dictionary of NISCODE -> GEMEENTE to check the 1-1 relation
    # Watch out: 1 NISCODE corresponds to multiple postcodes
    if (f_niscode not in gem_dic):
        gem_dic[f_niscode] = (f_gemeente, [f_postcode])
        stats['municipalities'] += 1
    else:
        if(gem_dic[f_niscode][0] != f_gemeente):
            error_log += "Other municipality-name found: " + gem_dic[f_niscode][0] + " != " + f_gemeente + " for NIS-code: " + f_niscode + "\n"
            f_stats['niscodes'] += 1
        if(f_postcode not in gem_dic[f_niscode][1]):
            gem_dic[f_niscode][1].append(f_postcode)
    # Check the opposite: does 1 postcode relate to 1 NIS-code? Do postcodes always fall within a municipality?
    if (f_postcode not in pc_nis_dic):
        pc_nis_dic[f_postcode] = f_niscode
    else:
        if(pc_nis_dic[f_postcode] != f_niscode):
            f_stats['postcodes'] += 1
            multiple_NIS_per_PC_log += str(f_id) + ", " + str(latitude) + ", " + str(longitude) + ", " + str(f_huisnr) + ", " + str(f_straatnmid) + ", " + str(f_straatnm) + ", " + str(f_postcode) + ", " + str(f_niscode) + ", " + str(f_gemeente) + ", " + str(pc_nis_dic[f_postcode]) + ", " + str(gem_dic[pc_nis_dic[f_postcode]][0]) + "\n"
    
time_at_load_end = time.time()
dispProgress("proc_rec")

# sort on postcode        
i = 0
for pcode in sorted(hier_addr_dic.keys()):
    dispProgress("write1" , "Starting writing JSON-files", i, len(hier_addr_dic))
    pcodeJson = {"streets": []}

    # sort on sanitized streetname
    str_ids = sorted(hier_addr_dic[pcode], key=lambda street_id : hier_addr_dic[pcode][street_id].sanitized)
    for str_id in str_ids:
        
        streetInfo = dict()
        streetInfo['b']         =   90.0
        streetInfo['t']         =  -90.0
        streetInfo['l']         =  180.0
        streetInfo['r']         = -180.0
        streetInfo['numOfAddr'] =    0
        streetInfo['name']      = hier_addr_dic[pcode][str_id].original
        streetInfo['sanName']   = hier_addr_dic[pcode][str_id].sanitized

        # add list of other postcode where street exists to street
        if (len(strtnm_dic[str_id][1])>1):
            streetInfo['otherPCs']   = sorted(filter(lambda x : x != pcode, strtnm_dic[str_id][1]))

        address_list = []
        #Sort on housenumber
        for housenumber in sorted(hier_addr_dic[pcode][str_id].housenumbers.keys()):
            # 1 housenumber contains multiple addresses: each has it own apptnr or busnr
            addresses_on_housenumber = hier_addr_dic[pcode][str_id].housenumbers[housenumber]
            busnrs  = sorted(filter(None, map(lambda x : x.busnr, addresses_on_housenumber)))
            apptnrs = sorted(filter(None, map(lambda x : x.apptnr, addresses_on_housenumber)))
            hnrlbls = list(set(filter(None, map(lambda addr : addr.hnrlabel, addresses_on_housenumber))))


            hnrlbls_dic = dict()
            for label in sorted(hnrlbls):
                if (label in hnrlbls_dic): hnrlbls_dic[label] += 1
                else                     : hnrlbls_dic[label]  = 1
                
            # optional error-string for the case that multiple housenumber-labels occur for 1 housenumber:
            # if (len(hnrlbls_dic) > 1) : print " != ".join(hnrlbls_dic.keys()) + "for " + pcode + ", " + hier_addr_dic[pcode][str_id].original + " " + address.housenumber

            address = addresses_on_housenumber[0]
            
            addr = dict()
            addr['housenumber'] = housenumber
            addr['lat']         = address.lat
            addr['lon']         = address.lon
            addr['pcode']       = pcode
            addr['street']      = hier_addr_dic[pcode][str_id].original
            addr['source']      = address.source

            addr['municipality'] = gem_dic[address.niscode][0]

            addr['hnrlbls'] = hnrlbls
                
            if(len(busnrs) > 0)  : addr['busnrs']  = busnrs
            if(len(apptnrs) > 0) : addr['apptnrs'] = apptnrs
            
            if (len(busnrs) > 0 and len(apptnrs) > 0):
                f_stats['busnrs_apptnrs'] += 1

            # what to do if address doesn't contain a location?
            if addr['lat'] == 0: continue
            
            # determine the street-extent
            streetInfo['numOfAddr'] += 1
            if addr['lat'] < streetInfo['b']: streetInfo['b'] = addr['lat']
            if addr['lon'] < streetInfo['l']: streetInfo['l'] = addr['lon']
            if addr['lat'] > streetInfo['t']: streetInfo['t'] = addr['lat']
            if addr['lon'] > streetInfo['r']: streetInfo['r'] = addr['lon']

            address_list.append(addr)

        if streetInfo['numOfAddr'] == 0: continue

        directory = "./data/" + str(pcode) + "/"
        if not os.path.exists(directory): os.makedirs(directory)

        with io.open(directory + streetInfo['sanName'] + ".json", 'wb') as json_file:
            json.dump({'addresses': address_list}, json_file, indent = 2, encoding='latin-1', sort_keys=True)

        pcodeJson["streets"].append(streetInfo)

    with io.open("./data/" + str(pcode) + ".json", 'wb') as json_file:
        json.dump(pcodeJson, json_file, indent = 2, encoding='latin-1', sort_keys=True)

    i += 1

f = open("multiple_NIS_per_PC.log", 'wb')
f.write(multiple_NIS_per_PC_log)
f.close()
dispProgress("write1")

time_at_end = time.time()

print "\nLoading took " + str(round(time_at_load_end - time_at_start, 0)) + " sec. Writing took " + str(round(time_at_end - time_at_load_end, 0)) + " sec"

print "\nFound objects:"
for s in stats.keys():
    print "\t" + str(stats[s]) + " " + s

print "\nStrange stuff:"
print "\t" + str(f_stats['strt_pcs'])  + " streets didn't match with only 1 postcode"


print "\nIntegrity check:"
print "\t" + str(f_stats['strnms'])    + " streetnames didn't match their streetname-id"
print "\t" + str(f_stats['strt_nis']) + " streets didn't match with only 1 municipality"
print "\t" + str(f_stats['niscodes'])  + " municipality-names didn't match their NIS-code"
print "\t" + str(f_stats['postcodes']) + " postcodes didn't match to 1 single municipality"
print "\t" + str(f_stats['PSH_not_unique']) + " addresses were identical on postcode, street and housenumber, but have different NIS-codes"
print "\t" + str(f_stats['busnrs_apptnrs']) + " addresses have one or more busnrs as well as one or more apptnrs"

if(len(error_log) > 0):
    print "\Error log:"
    print error_log








