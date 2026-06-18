;; The first three lines of this file were inserted by DrRacket. They record metadata
;; about the language level of this file in a form that our tools can easily process.
#reader(lib "htdp-intermediate-lambda-reader.ss" "lang")((modname f-p4-starter) (read-case-sensitive #t) (teachpacks ()) (htdp-settings #(#t constructor repeating-decimal #f #t none #f () #t)))
;; DO NOT PUT ANYTHING PERSONALLY IDENTIFYING BEYOND YOUR CWL IN THIS FILE.
(require spd/tags)
(require 2htdp/image)

(@assignment exams/2023w1-f/f-p4) ;Do not edit or remove this tag

(@cwl ???)   ;fill in your CWL here (same as for problem sets)

(@problem 1) ;do not edit or delete this line
(@problem 2) ;do not edit or delete this line
(@problem 3) ;do not edit or delete this line
(@problem 4) ;do not edit or delete this line


#|
 Please consult the problem description in f-p4-figure.pdf

 Then complete the design of the scircle function.

 Your function design must include an @htdf tag, @signature tag, purpose,
 commented out stub, appropriate tests, a @template-origin tag, and a
 function definition.

 NOTE: This problem will be autograded, and ALL OF THE FOLLOWING ARE ESSENTIAL
       IN YOUR SOLUTION.  Failure to follow these requirements may result in
       receiving zero marks for this problem.

 - The function you design MUST BE CALLED scircle. 
 - You MUST FOLLOW precisely the instructions in the f-p4-figure.pdf file.
 - You MUST USE the provided CUTOFF and DIVISOR constants.
 - You MUST FOLLOW all applicable design rules.

 - You MUST NOT edit, comment out, or delete the existing CUTOFF constant.
 - You MUST NOT edit, comment out, or delete the existing DIVISOR constant.
 - You MUST NOT edit, comment out, or delete the existing @htdf tag.
 - You MUST complete the function definition and then comment out the existing
   stub. Do not delete it.
 
 - You MUST NOT COMMENT out any @ metadata tags.
 
 - The file MUST NOT have any errors when the Check Syntax button is pressed.
   Press Check Syntax and Run often, and correct any errors early.

|#

(define CUTOFF 2)                 ;radius <= CUTOFF is trivial case

(define DIVISOR (+ 1 (sqrt 2)))   ;reduction

(@htdf scircle)

(define (scircle r c) empty-image)
