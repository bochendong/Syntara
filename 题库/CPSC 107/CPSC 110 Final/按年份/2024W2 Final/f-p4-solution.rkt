;; The first three lines of this file were inserted by DrRacket. They record metadata
;; about the language level of this file in a form that our tools can easily process.
#reader(lib "htdp-intermediate-lambda-reader.ss" "lang")((modname f-p4-solution) (read-case-sensitive #t) (teachpacks ()) (htdp-settings #(#t constructor repeating-decimal #f #t none #f () #t)))
(require spd/tags)

(@assignment exams/2024w2-f/f-p4) ;Do not edit or remove this tag

(@problem 1) ;do not edit or delete this line
(@problem 2) ;do not edit or delete this line
(@problem 3) ;do not edit or delete this line
(@problem 4) ;do not edit or delete this line

(@htdd Eevee)
(define-struct eevee (stone evolution))
;; Eevee is (make-evee String String)
;; interp. an Eevee with a desired stone, and their
;;         evolution 
(define EF (make-eevee "fire" "Flareon"))
(define EW (make-eevee "water" "Vaporeon"))
(define ET (make-eevee "thunder" "Jolteon"))
(define EL (make-eevee "leaf" "Leafeon"))
(define EI (make-eevee "ice" "Glaceon"))
(define EE (make-eevee "ever" "Eevee"))

(@dd-template-rules compound)

(define (fn-for-eevee e)
  (... (eevee-stone e)
       (eevee-evolution e)))

(@htdf can-all-eevolve?)
(@signature (listof Eevee) (listof String) -> (listof String))
;; produce true if all Eevees can evolve with the list of stones
(check-expect (can-all-eevolve? empty empty) true)
(check-expect (can-all-eevolve? (list (make-eevee "fire" "Flareon")
                                      (make-eevee "water" "Vaporeon"))
                                empty) false)
(check-expect (can-all-eevolve? empty (list "ice" "sun")) false)
(check-expect (can-all-eevolve? (list (make-eevee "fire" "Flareon")
                                      (make-eevee "water" "Vaporeon")
                                      (make-eevee "leaf" "Leafeon"))
                                (list "fire" "water" "water")) false)
(check-expect (can-all-eevolve? (list (make-eevee "thunder" "Jolteon")
                                      (make-eevee "water" "Vaporeon")
                                      (make-eevee "ice" "Glaceon"))
                                (list "thunder" "water" "ice")) true)
(check-expect (can-all-eevolve? (list (make-eevee "thunder" "Jolteon")
                                      (make-eevee "water" "Vaporeon")
                                      (make-eevee "fire" "Flareon"))
                                (list "thunder" "water")) false)
(check-expect (can-all-eevolve? (list (make-eevee "fire" "Flareon")
                                      (make-eevee "water" "Vaporeon"))
                                (list "fire" "water" "water")) false)
(check-expect (can-all-eevolve? (list (make-eevee "fire" "Flareon")
                                      (make-eevee "water" "Vaporeon"))
                                (list "water" "water" "water")) false)

;(define (can-all-eevolve? loe los) false) ;stub

#|
IN THIS TABLE WE ABBREVIATE (listof String) to LOS and (listof Eevee) to LOE

los                  empty       (cons String LOS)

loe                  

empty                true [1]    false [2]


(cons Eevee LOE)     false [2]   (and (string=? (first los) [3]
                                                (eevee-stone (first loe)))
                                      (can-all-eevolve? (rest loe) (rest los)))
|#                                      

(@template-origin 2-one-of)

(define (can-all-eevolve? loe los)
  (cond [(and (empty? loe) (empty? los)) true] ;[1]
        [(or (empty? loe) (empty? los)) false] ;[2]
        [else                                  ;[3]
         (and (string=? (first los)          
                        (eevee-stone (first loe)))
              (can-all-eevolve? (rest loe) (rest los)))]))


;; These two solutions are also possible.
#;
(define (can-all-eevolve? loe los)
  (cond [(empty? loe) (empty? los)]
        [(empty? los) false]
        [else               
         (and (string=? (first los)          
                        (eevee-stone (first loe)))
              (can-all-eevolve? (rest loe) (rest los)))]))
#;
(define (can-all-eevolve? loe los)
  (cond [(empty? los) (empty? loe)]
        [(empty? loe) false]
        [else               
         (and (string=? (first los)          
                        (eevee-stone (first loe)))
              (can-all-eevolve? (rest loe) (rest los)))]))


