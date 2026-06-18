;; The first three lines of this file were inserted by DrRacket. They record metadata
;; about the language level of this file in a form that our tools can easily process.
#reader(lib "htdp-intermediate-lambda-reader.ss" "lang")((modname f-p2-starter) (read-case-sensitive #t) (teachpacks ()) (htdp-settings #(#t constructor repeating-decimal #f #t none #f () #t)))
(require spd/tags)
(require 2htdp/image)

(@assignment exams/2023w2-f/f-p2) ;Do not edit or remove this tag

(@cwl ???)   ;fill in your CWL here (same as for problem sets)

(@problem 1) ;do not edit or delete this line
(@problem 2) ;do not edit or delete this line

#|
 
 Please consult the problem description in f-p2-figure.pdf
 Then complete the design of the spiral function.
 
 Your function design must include an @htdf tag, @signature tag, purpose,
 commented out stub, appropriate tests, a @template-origin tag, and a
 function definition.
 
 NOTE: This problem will be autograded, and ALL OF THE FOLLOWING ARE ESSENTIAL
       IN YOUR SOLUTION.  Failure to follow these requirements may result in
       receiving zero marks for this problem.
 
 - The function you design MUST BE CALLED spiral.
 - You MUST FOLLOW precisely the instructions in the f-p2-figure.pdf file.
 - You MUST USE the provided CUTOFF constant.
 - You MUST USE the provided DIVISOR constant.
 
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

(define CUTOFF 5)       ;(<= r CUTOFF) is trivial case
(define DIVISOR 1.618)  ;(/ r DIVISOR) is reduction step


; (@htdf spiral)
(define (spiral r)
  (cond
    [(<= r CUTOFF) (wedge r 90 "outline" "blue")]
    [else (beside/align "top"
                (rotate 90 (spiral (/ r DIVISOR)))
                (wedge r 90 "outline" "blue"))]
  ))
(spiral 100)