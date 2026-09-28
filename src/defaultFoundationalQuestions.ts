import type { AllowedDuration } from './studyTypes'

interface DefaultQuestion {
  seconds: AllowedDuration
  text: string
}

export const DEFAULT_FOUNDATIONAL_QUESTIONS: DefaultQuestion[] = [
  { seconds: 120, text: 'You need 5 liters of a 10 percent solution. On the shelf you find a 7 percent solution and a 12 percent solution. How many liters of the 7 percent solution must you mix with the appropriate amount of the 12 percent solution to get 5 liters of 10 percent solution?' },
  { seconds: 120, text: 'The denominator of a certain fraction is 3 more than twice the numerator. If 7 is added to both terms of the fraction, the resulting fraction is 3 over 5. Find the original fraction.' },
  { seconds: 60, text: 'In the expansion of the quantity x plus 4y, raised to the 12th power, find the numerical coefficient of the 5th term.' },
  { seconds: 60, text: 'Determine x so that x, 2x plus 7, and 10x minus 7 will be a geometric progression.' },
  { seconds: 60, text: 'The sum of the digits of a two digit number is 11. If the digits are reversed, the resulting number is 7 more than twice the original number. What is the original number?' },
  { seconds: 120, text: 'Ana is 5 years older than Beth. In 5 years, the product of their ages will be 1.5 times the product of their present ages. How old is Beth now?' },
  { seconds: 60, text: 'A piece of paper is 0.05 inches thick. Each time the paper is folded in half, the thickness is doubled. If the paper is folded 12 times, how thick, in feet, will the folded paper be?' },
  { seconds: 120, text: 'A speed boat can make a trip of 100 miles in one hour and 30 minutes if it travels upstream. If it travels downstream, it takes one hour and 15 minutes to travel the same distance. What is the speed of the boat in calm water, in miles per hour?' },
  { seconds: 120, text: "At approximately what time after 12 o'clock will the hour hand and the minute hand of a clock form an angle of 120 degrees for the second time?" },
  { seconds: 60, text: 'If k times x cubed minus the quantity k plus 3 times x squared plus 13 is divided by x minus 4, and the remainder is 157, what is the value of k?' },
  { seconds: 120, text: 'Four positive integers form an arithmetic progression. If the product of the first and last terms is 70, and the product of the second and third terms is 88, find the first term.' },
  { seconds: 120, text: 'A professional organization is composed of x E C Es and 2x E Es. If 6 E C Es are replaced by 6 E Es, one sixth of the members will be E C Es. Solve for x.' },
  { seconds: 60, text: 'Solve for x if 8 to the power x equals 2 to the power y plus 2, and 16 to the power 3x minus y equals 4 to the power y.' },
  { seconds: 120, text: 'X can do a job 50 percent faster than Y, and 20 percent faster than Z. If they work together, they can finish the job in 4 days. How many days will it take X to finish the job if he works alone?' },
  { seconds: 60, text: 'The arithmetic mean and the geometric mean of two numbers are 10 and 8 respectively. Find the harmonic mean.' },
  { seconds: 30, text: 'If log of 2 equals a, log of 3 equals b, and log of 5 equals c, then log of 7.5 equals what, in terms of a, b, and c?' },
  { seconds: 120, text: 'A pole casts a shadow 15 meters long when the angle of elevation of the sun is 61 degrees. If the pole has leaned 15 degrees from the vertical directly toward the sun, what is the length of the pole?' },
  { seconds: 60, text: 'Solve for x in the equation: arctangent of 2x plus arctangent of x equals pi over 4.' },
  { seconds: 60, text: 'The hypotenuse of a right triangle is 34 centimeters. Find the lengths of the two legs if one leg is 14 centimeters longer than the other.' },
  { seconds: 60, text: 'If sine of A equals 4 over 5 in quadrant 2, and sine of B equals 7 over 25 with B in quadrant 1, find sine of A plus B.' },
  { seconds: 120, text: 'A man finds the angle of elevation of the top of a tower to be 30 degrees. He walks 85 meters nearer the tower and finds its angle of elevation to be 60 degrees. What is the height of the tower?' },
  { seconds: 120, text: 'Points A and B, 1000 meters apart, are on a straight highway running east and west. From A, the bearing of a tower C is 32 degrees west of north. From B, the bearing of C is 26 degrees north of east. Approximate the shortest distance from tower C to the highway.' },
  { seconds: 60, text: 'A railroad is to be laid out in a circular path. What should the radius be if the track is to change direction by 30 degrees over a distance of 157.08 meters?' },
  { seconds: 30, text: 'If A plus B plus C equals 180 degrees, and tangent A plus tangent B plus tangent C equals 5.67, find the value of tangent A times tangent B times tangent C.' },
  { seconds: 60, text: 'Three times the sine of a certain angle is twice the square of the cosine of the same angle. Find the angle.' },
  { seconds: 120, text: 'Triangle ABC is a right triangle with the right angle at C. If BC equals 4 and the altitude to the hypotenuse is 1, find the area of triangle ABC.' },
  { seconds: 30, text: 'A certain angle has an explement 5 times its supplement. Find the angle.' },
  { seconds: 30, text: 'Find the length of the chord of a circle of radius 20 centimeters subtended by a central angle of 150 degrees.' },
  { seconds: 120, text: 'An observer 5 meters away from the base of a building finds that the angle of elevation of the top of the building is twice the angle of elevation when he is 25 meters away from it. Find the height of the building.' },
  { seconds: 120, text: 'The angle of elevation of the top of tower B from the top of tower A is 28 degrees. The angle of elevation of the top of tower A from the base of tower B is 46 degrees. The two towers lie on the same horizontal plane. If the height of tower B is 120 meters, find the height of tower A.' },
]