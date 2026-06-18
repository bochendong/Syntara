;; The first three lines of this file were inserted by DrRacket. They record metadata
;; about the language level of this file in a form that our tools can easily process.
#reader(lib "htdp-intermediate-lambda-reader.ss" "lang")((modname f-p4-solution) (read-case-sensitive #t) (teachpacks ()) (htdp-settings #(#t constructor repeating-decimal #f #t none #f () #t)))
(require spd/tags)

(@assignment exams/2021w1-f/f-p4)

(@cwl ???)   ;fill in your CWL here (same CWL you put for 110 problem sets)

(@problem 1) ;do not edit or delete this tag
(@problem 2) ;do not edit or delete this tag
(@problem 3) ;do not edit or delete this tag
(@problem 4) ;do not edit or delete this tag

#|

Data definitions:

|#

(@htdd Room)
(@htdd Stairs)
(define-struct room (name los))
(define-struct stairs (label number to-room-name))
;;
;; Room is (make-room String (listof Stairs))
;; Stairs is (make-stairs String Natural String)
;;
;; interp.
;;  Rooms have a name and a list of the stairs leading AWAY from that room.
;; 
;;  Stairs have a label, a number of steps, and the name of the room they 
;;  lead to. The label of stairs are always formed the same way are are
;;  intended to describe where they fit in the graph - a stairs with 4 steps
;;  that leads from room "A" to room "C" will have label "a-4-c".
;;


(@template-origin encapsulated Room (listof Stairs) Stairs genrec)

(define (fn-for-haunted-house from)
  ;; trivial case:
  ;; reduction step:
  ;; proof of termination:
  (local [(define (fn-for-room rm)
            (... (room-name rm)
                 (fn-for-los (room-los rm))))

          (define (fn-for-los los)
            (cond [(empty? los) (...)]
                  [else
                   (... (fn-for-stairs (first los))
                        (fn-for-los (rest los)))]))

          (define (fn-for-stairs strs)
            (... (stairs-label strs)
                 (stairs-number strs)
                 (fn-for-room (get-room (stairs-to-room-name strs)))))]

    (fn-for-room (get-room from))))


(@htdf find-increasing-path-sr)
(@signature String String -> (listof String) or false)

(check-expect (find-increasing-path-sr "Z" "G") false)
(check-expect (find-increasing-path-sr "E" "B") false)

(check-expect (find-increasing-path-sr "A" "A") empty)
(check-expect (find-increasing-path-sr "D" "D") empty)
(check-expect (find-increasing-path-sr "B" "B") empty)

(check-expect (find-increasing-path-sr "A" "F") (list "a-4-b" "b-5-f"))
(check-expect (find-increasing-path-sr "A" "Z") (list "a-4-b" "b-5-f" "f-6-z"))
(check-expect (find-increasing-path-sr "A" "G") (list "a-4-d" "d-6-g"))

(check-expect (find-increasing-path-sr "A" "E") (list "a-4-b" "b-5-e"))
(check-expect (find-increasing-path-sr "D" "Z") (list "d-4-f" "f-6-z"))
(check-expect (find-increasing-path-sr "E" "Z") (list "e-3-z"))

;(define (find-increasing-path-sr from to) false) ;stub

(@template-origin encapsulated
           Room (listof Stairs) Stairs ;original types
           genrec                      ;get-room is generative
           accumulator                 ;path
           try-catch)                  ;failure handling in sr

(define (find-increasing-path-sr from to)
  ;; trivial:   reaches to room or previously traversed room on path
  ;; reduction: at each stair lookup the room it leads to
  ;; proof:     house is finite, if we never go to any given room
  ;;            more than once we will run out of rooms to visit

  ;; path is (listof Stairs)
  (local [(define (fn-for-room rm path)
            (if (string=? (room-name rm) to)
                (map stairs-label (reverse path))
                (fn-for-los (room-los rm) path)))

          (define (fn-for-los los path)
            (cond [(empty? los) false]
                  [else
                   (local [(define try (fn-for-stairs (first los) path))]
                     (if (not (false? try))
                         try
                         (fn-for-los (rest los) path)))]))

          (define (fn-for-stairs strs path)
            (cond [(member strs path) false]
                  [(and (not (empty? path))
                        (<= (stairs-number strs)
                            (stairs-number (first path))))
                   false]
                  [else
                   (fn-for-room (get-room (stairs-to-room-name strs))
                                (cons strs path))]))]

    (fn-for-room (get-room from) empty)))




;; ****
;;
;; Below here is the definition of get-room.  You should treat it as a primitive
;; function described above, and should not look at its definition.
;;

(define HOUSE '(("A" ((4 "B") (2 "C") (4 "D")))
                ("B" ((5 "E") (5 "F")))
                ("C" ((3 "F")))
                ("D" ((4 "F") (6 "G")))
                ("E" ((6 "A") (3 "Z")))
                ("F" ((6 "Z")))
                ("G" ((7 "Z")))
                ("Z" ())))

  
(define (get-room name)
  (local [(define entry (assoc name HOUSE))]
    (if (false? entry)
        (error "No room with name " name)
        (make-room (first entry)
                   (map (lambda (args)
                          (make-stairs
                           (string-downcase
                            (string-append (first entry)
                                           "-"
                                           (number->string (first args))
                                           "-"
                                           (second args)))
                           (first args)
                           (second args)))
                        (second entry))))))
