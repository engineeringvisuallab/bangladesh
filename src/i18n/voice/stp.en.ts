/**
 * STP (Sewage Treatment Plant) - English narration, one line per tour stop.
 * Key = voiceId = file name of a future recording: public/assets/voice/en/stp/<key>.mp3
 * Written for students of every level: plain words first, the technical term next to it.
 */
export const stpVoice = {
  intro:
    'Welcome. This is a sewage treatment plant, or STP. Every toilet, kitchen, bathroom and factory sends dirty water into drains and pipes. If that water went straight into a river, the river would die: fish would disappear and diseases would spread. This plant cleans the dirty water first, and only then lets it go back to the river. First we will follow the cleaning steps, then we will see how the mud that collects along the way, called sludge, is handled. Notice the pipe colours: reddish-brown pipes carry dirty water, light blue pipes carry treated water, dark grey pipes carry sludge, light grey-blue pipes carry air, and orange pipes carry biogas.',
  gate:
    'This is the main gate. A sewage plant contains poisonous gas, germ-filled water and heavy machinery, so it is not safe for strangers, even for their own sake. The whole site is fenced and this gate is the only way in. The people who work inside wear protective clothing and carry gas detectors.',
  inlet:
    'Dirty water arrives through the big city sewers, deep under the ground. So the first job is to lift it up, so that from here on the water can flow downhill by itself. This is done by screw pumps, which look like giant spiral screws. When a screw turns inside its sloping channel, the water is carried up along the spiral grooves. A screw pump can lift water full of dirt and small rubbish without clogging, which an ordinary pump cannot.',
  screen:
    'From the channel above, the water now goes to the screens. Sewage carries plastic bags, cloth, pieces of wood and even small bottles. A sloping iron grille catches them, and a mechanical rake pulls them up and drops them into the yellow bin next to it. Without this step the rubbish would pile up in the next pumps and pipes and block everything. It is later taken away by truck.',
  grit:
    'After the screens, the water reaches the grit chamber. Grit means sand, gravel, small stones and even egg shells. It is heavy and hard, and it wears out pumps and machines. Air bubbles rise from the bottom of this tank. The bubbles keep the light organic dirt floating, while the heavy sand and gravel sink. A classifier lifts the grit out, washes it and drops it into a bin.',
  primary:
    'Now the primary clarifier, the first settling tank. Water enters through the middle of this round tank and spreads slowly outwards. In about two hours the heavy organic dirt settles to the bottom, while light oil and grease float to the top. Scrapers on a slowly turning bridge push the thick mud on the floor into a pit in the centre. This mud is called primary sludge. The fairly clear water on top flows out over the edge into a channel. A large part of the pollution is already removed at this step.',
  aeration:
    'This is where the real cleaning happens: the aeration tank. The water still holds dissolved dirt that you cannot see. To eat that dirt, the tank is filled with billions of helpful bacteria, a mixture called activated sludge. But bacteria need oxygen to live and work. So air is pumped in from the bottom of the tank all the time, which is why you see foam and bubbles on top. The water stays here for about six to eight hours. During that time the bacteria eat the dirt and multiply, and the water becomes much cleaner.',
  blower:
    'The building beside the tank is the blower house. Powerful blowers squeeze air into the grey-blue pipes that lead to the diffusers on the tank floor. A diffuser is a perforated pipe or disc that turns the air into very small bubbles. The smaller the bubbles, the better the oxygen dissolves in the water. A big share of the plant\'s electricity bill goes to these blowers.',
  secondary:
    'After aeration the water carries tiny floating lumps of bacteria. So in this secondary clarifier the water is settled once more. The heavy bacterial lumps sink, and much cleaner water comes out on top. A large part of the bacteria on the bottom is pumped back to the aeration tank so that it always has enough bacteria. This is called return activated sludge. The bacteria keep growing, so the extra amount is removed from the system.',
  disinfection:
    'The water is now much cleaner, but disease germs are not completely gone, so the last step is disinfection. In the small building nearby there is a chlorine solution. A light green-yellow pipe adds a small dose of chlorine into the chlorine contact tank. Inside, walls form a zig-zag path so that the water stays in contact with the chlorine long enough to kill the germs. If needed, extra chlorine is removed before the water goes to the river, because chlorine harms fish.',
  outfall:
    'This disinfected water is now ready to return to the river. The pipe runs underground to the river bank and ends under the water surface. The small room next to it is the sampling room. Water samples are taken here regularly and tested: is the remaining pollution, measured as BOD, the dissolved oxygen and the number of germs within the legal limits? If not, something in the plant is wrong and must be fixed at once.',
  thickener:
    'Now a story about mud, not water. The sludge from the primary and secondary clarifiers is almost all water, ninety-seven to ninety-nine percent. Such watery mud is hard and costly to handle. In this round sludge thickener, a slowly turning picket-fence stirrer makes the mud denser while the water separates and rises. The thick mud is pumped from the bottom to the next step.',
  digester:
    'This huge round tank is the anaerobic digester. Anaerobic means without air. The thick sludge is kept in this closed tank, warm, for twenty to thirty days. Bacteria that live without oxygen work here. They eat the organic part of the sludge, so the amount of sludge shrinks, the smell drops, and many disease germs die. The red heat exchanger beside it keeps the sludge warm. Biogas collects under the dome at the top.',
  gas:
    'The gas made by the bacteria in the digester is called biogas. Its main part is methane, which burns just like cooking gas. An orange pipe carries it to the green gas holder, a soft balloon-like dome. This gas can keep the digester warm, or run a generator to make electricity. Any extra gas is burned in the flare stack nearby, because releasing methane directly into the air harms the environment.',
  dewatering:
    'Even after the digester the sludge is still liquid. So it comes to the dewatering building, which has a belt filter press. A polymer is mixed into the sludge, and then it is squeezed between two belts so the water runs out. What comes out is a dry, cake-like solid that is loaded onto trucks. If tests show it is safe, it can be used as fertiliser or to improve soil. The water squeezed out goes back to the start of the plant.',
  electrical:
    'The pumps, blowers and scrapers of this plant all run on electricity. The power line from outside comes into this substation, and a transformer lowers the voltage to what the machines can use. Next to it is a diesel generator. If the power fails, it starts automatically, because when the air stops in the aeration tank the bacteria can die, and then it takes many days to get the plant working again.',
  lab:
    'Finally we are at the control room and laboratory. In the first-floor control room, engineers watch screens to see which pump is running, what is happening in each tank, and whether anything is going wrong. In the lab, water samples from every step are tested every day: pH, dissolved oxygen, cloudiness, and BOD, which tells how much organic dirt is left in the water. These tests tell us whether the plant is doing its job.',
  outro:
    'That is the whole journey. The city\'s dirty water was lifted by the screw pumps, dropped its rubbish at the screens, its sand in the grit chamber, its heavy dirt in the first tank, became food for bacteria in aeration, settled again in the second tank, was disinfected with chlorine, and rejoined the river clean. The mud collected on the way gave gas in the digester and ended as a dry cake that can enrich soil. Behind every flushed toilet in the city stands this whole system. Thank you.',
} as const;
export type StpVoiceId = keyof typeof stpVoice;
