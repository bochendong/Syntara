;; The first three lines of this file were inserted by DrRacket. They record metadata
;; about the language level of this file in a form that our tools can easily process.
#reader(lib "htdp-intermediate-lambda-reader.ss" "lang")((modname f-p5-starter) (read-case-sensitive #t) (teachpacks ()) (htdp-settings #(#t constructor repeating-decimal #f #t none #f () #t)))
;; DO NOT PUT ANYTHING PERSONALLY IDENTIFYING BEYOND YOUR CWL IN THIS FILE.
(require spd/tags)

(@assignment exams/2023w1-f/f-p5) ;Do not edit or remove this tag

(@cwl ???)   ;fill in your CWL here (same as for problem sets)

(@problem 1) ;do not edit or delete this line
(@problem 2) ;do not edit or delete this line
(@problem 3) ;do not edit or delete this line
(@problem 4) ;do not edit or delete this line
(@problem 5) ;do not edit or delete this line

#|
 Please consult the problem description in f-p5-figure.pdf.

 Then complete the design of the drained-centimeters function.

 Your function design must include an @htdf tag, @signature tag, purpose,
 commented out stub, appropriate tests, a @template-origin tag, and a 
 function definition.

 NOTE: This problem will be autograded, and ALL OF THE FOLLOWING ARE ESSENTIAL
       IN YOUR SOLUTION.  Failure to follow these requirements may result in
       receiving zero marks for this problem.

 - The function you design MUST BE CALLED drained-centimeters. 
 - You MUST FOLLOW precisely the instructions in the f-p5-figure.pdf file.
 - You MUST FOLLOW all applicable design rules.

 - You MUST NOT edit, comment out, or delete the existing @htdf tag.
 - You MUST complete the function definition and then comment out the existing
   stub. Do not delete it.
 
 - You MUST NOT COMMENT out any @ metadata tags.
 
 - The file MUST NOT have any errors when the Check Syntax button is pressed.
   Press Check Syntax and Run often, and correct any errors early.

|#


(@htdf drained-centimeters)

(define (drained-centimeters lon) 0)

; 一开始最低值是0
; 如果左小于右，那么加 (max 最低值，左值 )
; 如果左大于右，那么更新最低值为左值











