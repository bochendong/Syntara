;; The first three lines of this file were inserted by DrRacket. They record metadata
;; about the language level of this file in a form that our tools can easily process.
#reader(lib "htdp-intermediate-reader.ss" "lang")((modname mt2-p5-solution) (read-case-sensitive #t) (teachpacks ()) (htdp-settings #(#t constructor repeating-decimal #f #t none #f () #f)))
(require spd/tags)
(require 2htdp/image)

(@assignment 107/exams/2025w2-mt2/mt2-p5) ;Do not edit or remove this tag

(@cwl ???)   ;fill in your CWL here

(@problem 1) ;do not edit or delete this line
(@problem 2) ;do not edit or delete this line
(@problem 3) ;do not edit or delete this line
(@problem 4) ;do not edit or delete this line
(@problem 5) ;do not edit or delete this line

#|

 Complete the design of a function that consumes a (listof String) los
 representing colors and a natural number n. The function should produce an
 image of a target consisting of nested solid circles, where the largest circle
 has radius 5*n and each subsequent circle decreases in radius, with colors
 from los.

 The largest circle will have a radius of 5n with the first color from los.
 The next largest circle will have a radius of 5(n-1) with the second color
 from los, drawn on top. If there are no colours left in los or n <= 0, then
 no circles will be drawn.

 For example,

 (create-target (list "red" "green" "blue") 3)

 will produce

 (overlay (circle 5 "solid" "blue")
          (circle 10 "solid" "green") (circle 15 "solid" "red"))
 
 
 You MUST TREAT THIS AS A 2-ONE-OF PROBLEM. 
 Your function MUST TRAVERSE THE LISTS ONE TIME ONLY AND SIMULTANEOUSLY.
 Your function MUST NOT CALL length or list-ref.

 You MUST submit a properly filled in 2-one-of table in your solution.  
 You MUST NUMBER THE TABLE CELLS AND THE CORRESPONDING COND QUESTION/ANSWER 
 PAIRS.

 IF IT IS POSSIBLE TO SIMPLIFY:
  Correct simplified code will get the highest score.
  Correct unsimplified code will get a higher score than incorrect code.

 Your answer must also include @signature, purpose, check-expects,
 @template-origin and a correct function definition.

 NOTE: This problem will be autograded and PARTLY HAND GRADED. ALL OF THE
       FOLLOWING ARE ESSENTIAL IN YOUR SOLUTION.  Failure to follow these
       requirements may result in receiving zero marks for this problem.

 - The function you design MUST BE CALLED create-target.
 
 - You MUST FOLLOW all applicable design rules.
 
 - You MUST complete the function definition.
 
 - You MUST NOT COMMENT out any @ metadata tags.
 
 - The file MUST NOT have any errors when the Check Syntax button is pressed.
   Press Check Syntax and Run often, and correct any errors early.

|#

(@htdf create-target)
(@signature (listof String) Natural -> Image)
;; produce nested circles of radius 5*n, decreasing, with colors from los
(check-expect
 (create-target (list "red" "green" "blue" "purple" "yellow" "pink") 0)
 empty-image)
(check-expect (create-target empty 6) empty-image)
(check-expect (create-target empty 0) empty-image)
(check-expect
 (create-target (list "red" "green" "blue" "purple" "yellow" "pink") 6)
 (overlay (circle 5 "solid" "pink") (circle 10 "solid" "yellow")
          (circle 15 "solid" "purple") (circle 20 "solid" "blue")
          (circle 25 "solid" "green") (circle 30 "solid" "red")))
(check-expect
 (create-target (list "red" "green" "blue" "purple" "yellow" "pink") 4)
 (overlay (circle 5 "solid" "purple") (circle 10 "solid" "blue")
          (circle 15 "solid" "green") (circle 20 "solid" "red")))
(check-expect
 (create-target (list "red" "green" "blue" "purple" "yellow" "pink") 8)
 (overlay (circle 15 "solid" "pink") (circle 20 "solid" "yellow")
          (circle 25 "solid" "purple") (circle 30 "solid" "blue")
          (circle 35 "solid" "green") (circle 40 "solid" "red")))

;(define (create-target los n) empty-image) ;stub

#|

IN THIS TABLE WE ABBREVIATE (listof String) to LOS

n                      0            (add1 Natural)

los                 

empty               empty-image [1]     empty-image [1]


(cons String LOS)   empty-image [1]      (overlay   [2]
                                          (create-target (rest los) (sub1 n))
                                          (circle (* 5 n) "solid" (first los)))
       
|#                           

(@template-origin 2-one-of)

(define (create-target los n)
  (cond [(or (zero? n) (empty? los)) empty-image] ;[1]
        [else                                     ;[2]
         (overlay 
          (create-target (rest los) (sub1 n))
          (circle (* 5 n) "solid" (first los)))]))