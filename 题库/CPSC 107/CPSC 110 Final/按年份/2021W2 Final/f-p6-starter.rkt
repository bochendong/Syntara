;; The first three lines of this file were inserted by DrRacket. They record metadata
;; about the language level of this file in a form that our tools can easily process.
#reader(lib "htdp-intermediate-lambda-reader.ss" "lang")((modname f-p6-starter) (read-case-sensitive #t) (teachpacks ()) (htdp-settings #(#t constructor repeating-decimal #f #t none #f () #t)))
(require spd/tags)

(@assignment exams/2021w2-f/f-p6)

(@cwl ???) ;fill in your CWL here (same as for problem sets)

(@problem 1) ;do not edit or delete this line 
(@problem 2) ;do not edit or delete this line 
(@problem 3) ;do not edit or delete this line 
(@problem 4) ;do not edit or delete this line 
(@problem 5) ;do not edit or delete this line 
(@problem 6) ;do not edit or delete this line 

#|

Complete the design of the following function by writing the template tag
and the function definition.  

This problem will be autograded.  NOTE that all of the following are required.
Violating one or more will cause your solution to receive 0 marks.

  - Files must not have any errors when the Check Syntax button is pressed.
    Press Check Syntax and Run often, and correct any errors early.

  - The function definition MUST call one or more built-in abstract functions.

  - For maximum credit the function definition should use the most clear
    and expressive combination of abstract functions.  In particular, do
    not use foldr for everything just because you can use foldr for
    everything.

  - The function definition MUST NOT be recursive.

  - The function definition MUST NOT use any part of the recursive Natural
    template or the (listof X) template.

      - it must not include (cond [(empty? ... anywhere
      - it must not include (cond [(zero? ... anywhere

  - The result of the function must directly be the result of one of the
    built-in abstract functions. So, for example, the following is not
    a valid function body:

       (define (foo x)
         (empty? (filter ...)))

  - You MUST NOT change or comment out any check-expects, but you are free
    to add new ones.

|#

(@htdf sum-odd-below)
(@signature Natural -> Natural)
;; produce the sum of the odd naturals < the given number
(check-expect (sum-odd-below 0) 0)
(check-expect (sum-odd-below 6) (+ 1 3 5))
(check-expect (sum-odd-below 7) (+ 1 3 5))

(define (sum-odd-below n) 0) ; stub

