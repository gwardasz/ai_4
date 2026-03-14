1. 
get_suspects()
No arguments needed. Downloads and returns the master list of suspects. Returns a JSON array of objects, where each object contains 'name' (string), 'surname' (string), and 'birthYear' (integer)

2. 
get_power_plants_locations()
No arguments needed. Downloads the large power plant locations dataset to the sandbox. Returns ONLY the filename (string) where the data is stored, to be used in subsequent tool calls.

3. 
who_approached_power_plant()
Cross-references a list of suspects against the power plant data to find who was present. Arguments: 'suspects' (JSON array of {name, surname} objects) and 'powerplant_filename' (string). Returns a JSON array of the matched suspects, including their 'name', 'surname', and the 'power_plant_id' they approached.

4.
get_user_access_level()
Fetches the security access level for a specific user. Arguments: 'name' (string), 'surname' (string), and 'birthYear' (integer). Returns the access level as an integer.

5. 
report_user()
Submits the final solution to the server. Arguments: 'name' (string), 'surname' (string), 'power_plant_id' (string), and 'user_access_level' (integer). Returns the server's response string. If correct, this will contain the success FLAG.



 